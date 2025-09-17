const { getPool, sql } = require('../config/database');
const excelService = require('../services/excelService');
const emailService = require('../services/emailService');
const fs = require('fs');
const path = require('path');

const studentController = {
  // Add single student - NO RESUME FIELD
  addStudent: async (req, res) => {
    try {
      const { name, email, phone } = req.body;
      const pool = await getPool();

      // Validate required fields
      if (!name || !email || !phone) {
        return res.status(400).json({ error: 'Name, email, and phone are required' });
      }

      // Check duplicate email
      const checkResult = await pool.request()
        .input('email', sql.NVarChar, email.trim().toLowerCase())
        .query('SELECT Id FROM Students WHERE Email = @email');

      if (checkResult.recordset.length > 0) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      const result = await pool.request()
        .input('name', sql.NVarChar, name.trim())
        .input('email', sql.NVarChar, email.trim().toLowerCase())
        .input('phone', sql.NVarChar, phone.trim())
        .query(`
          INSERT INTO Students (Name, Email, Phone, CreatedAt)
          VALUES (@name, @email, @phone, GETDATE());
          SELECT SCOPE_IDENTITY() as Id;
        `);

      res.status(201).json({
        message: 'Student added successfully',
        studentId: result.recordset[0].Id,
        student: {
          id: result.recordset[0].Id,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim()
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add student' });
    }
  },

  // Get all students
  getStudents: async (req, res) => {
    try {
      const pool = await getPool();
      const result = await pool.request()
        .query('SELECT * FROM Students ORDER BY CreatedAt DESC');

      res.json(result.recordset);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch students' });
    }
  },

  // Get student by token - WITH EXPIRATION CHECK
  getStudentByToken: async (req, res) => {
    try {
      const { token } = req.params;
      
      if (!token) {
        return res.status(400).json({ error: 'Token is required' });
      }

      const pool = await getPool();
      
      const result = await pool.request()
        .input('token', sql.NVarChar, token)
        .query(`
          SELECT 
            s.Id, s.Name, s.Email, s.Phone, s.ResumeLink, s.ResumeFileName, s.CreatedAt,
            i.Status as InterviewStatus,
            i.TokenExpiredAt,
            i.SlotId as ExistingSlotId,
            i.MeetingLink,
            i.Interviewer
          FROM Students s
          JOIN Interviews i ON s.Id = i.StudentId
          WHERE i.InvitationToken = @token
        `);
      
      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Invalid invitation token' });
      }
      
      const student = result.recordset[0];

      // Check if token is expired
      if (student.TokenExpiredAt) {
        return res.status(410).json({ 
          error: 'This invitation link has expired and is no longer valid',
          expiredAt: student.TokenExpiredAt,
          reason: 'Link was used to book an interview slot',
          studentName: student.Name
        });
      }

      // Check if already scheduled (additional safety check)
      if (student.ExistingSlotId) {
        return res.status(410).json({ 
          error: 'You have already booked an interview slot with this invitation',
          reason: 'Interview already scheduled',
          slotId: student.ExistingSlotId,
          meetingLink: student.MeetingLink,
          interviewer: student.Interviewer
        });
      }

      // Check interview status
      if (student.InterviewStatus !== 'Invited') {
        return res.status(400).json({ 
          error: `Interview status is ${student.InterviewStatus}. Cannot proceed with slot selection.`
        });
      }

      res.json({
        id: student.Id,
        name: student.Name,
        email: student.Email,
        phone: student.Phone,
        resumeLink: student.ResumeLink ? 'uploaded' : null,
        createdAt: student.CreatedAt,
        interviewStatus: student.InterviewStatus
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch student' });
    }
  },

  // Update resume by token - STORE FILE PATH
  updateResume: async (req, res) => {
    try {
      const { token } = req.params;
      
      if (!token) {
        return res.status(400).json({ error: 'Token is required' });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const pool = await getPool();
      
      // Check token validity and expiration
      const tokenCheck = await pool.request()
        .input('token', sql.NVarChar, token)
        .query(`
          SELECT 
            s.Id, s.Name, s.Email, 
            i.TokenExpiredAt, 
            i.Status as InterviewStatus,
            i.SlotId as ExistingSlotId
          FROM Students s
          JOIN Interviews i ON s.Id = i.StudentId
          WHERE i.InvitationToken = @token
        `);
      
      if (tokenCheck.recordset.length === 0) {
        return res.status(404).json({ error: 'Invalid invitation token' });
      }

      const student = tokenCheck.recordset[0];

      // Check if token is expired
      if (student.TokenExpiredAt) {
        return res.status(410).json({ 
          error: 'This invitation link has expired and cannot be used to update resume',
          expiredAt: student.TokenExpiredAt,
          reason: 'Link was already used to book an interview slot'
        });
      }

      // Check if already has a slot booked
      if (student.ExistingSlotId) {
        return res.status(410).json({ 
          error: 'You have already completed the interview booking process',
          reason: 'Resume cannot be updated after slot booking'
        });
      }

      // Check interview status
      if (student.InterviewStatus !== 'Invited') {
        return res.status(400).json({ 
          error: `Interview status is ${student.InterviewStatus}. Cannot update resume.`
        });
      }

      // Store the file path and original filename
      const filePath = req.file.path;
      const originalFilename = req.file.originalname;
      
      // Update the student's resume with file path and filename
      const updateResult = await pool.request()
        .input('token', sql.NVarChar, token)
        .input('resumeLink', sql.NVarChar, filePath)
        .input('resumeFileName', sql.NVarChar, originalFilename)
        .query(`
          UPDATE Students 
          SET ResumeLink = @resumeLink, ResumeFileName = @resumeFileName
          WHERE Id IN (
            SELECT StudentId FROM Interviews 
            WHERE InvitationToken = @token 
            AND TokenExpiredAt IS NULL 
            AND Status = 'Invited'
          )
        `);

      // Check if update was successful
      if (updateResult.rowsAffected[0] === 0) {
        return res.status(410).json({ 
          error: 'Cannot update resume. The invitation may have expired or been used.',
          reason: 'Token no longer valid for updates'
        });
      }
      
      res.json({ 
        message: 'Resume updated successfully',
        fileName: req.file.filename,
        originalFileName: originalFilename,
        studentName: student.Name
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update resume' });
    }
  },

  // Download resume by student ID - SIMPLE STUDENT NAME ONLY
  downloadResume: async (req, res) => {
    try {
      const { studentId } = req.params;
      
      if (!studentId) {
        return res.status(400).json({ error: 'Student ID is required' });
      }

      const pool = await getPool();
      
      // Get student and resume info
      const result = await pool.request()
        .input('studentId', sql.Int, parseInt(studentId))
        .query(`
          SELECT Id, Name, Email, ResumeLink, ResumeFileName 
          FROM Students 
          WHERE Id = @studentId AND ResumeLink IS NOT NULL
        `);
      
      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Student not found or no resume uploaded' });
      }

      const student = result.recordset[0];
      let resumePath = student.ResumeLink;

      // Handle different path formats
      if (student.ResumeLink.startsWith('http')) {
        const urlParts = student.ResumeLink.split('/');
        const filename = urlParts[urlParts.length - 1];
        resumePath = path.join(__dirname, '../uploads', filename);
      } else if (!path.isAbsolute(student.ResumeLink)) {
        resumePath = path.join(__dirname, '..', student.ResumeLink);
      }

      // Check if file exists
      if (!fs.existsSync(resumePath)) {
        return res.status(404).json({ error: 'Resume file not found on server' });
      }

      // Get file stats and extension
      const stats = fs.statSync(resumePath);
      const fileExtension = path.extname(resumePath).toLowerCase();
      
      // Set appropriate content type
      let contentType = 'application/octet-stream';
      switch (fileExtension) {
        case '.pdf':
          contentType = 'application/pdf';
          break;
        case '.doc':
          contentType = 'application/msword';
          break;
        case '.docx':
          contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;
      }

      // Generate clean student name for filename
      const cleanStudentName = student.Name
        .trim()
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);

      // Create filename with ONLY student name + extension
      const downloadFilename = `${cleanStudentName}${fileExtension}`;

      // Set headers for download
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Stream the file
      const fileStream = fs.createReadStream(resumePath);
      fileStream.pipe(res);
      
      fileStream.on('error', (error) => {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to download resume' });
        }
      });

    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download resume' });
      }
    }
  },

  // ADD THIS METHOD to your existing studentController object
// Send bulk invitation emails with sequential processing
sendBulkInvitations: async (req, res) => {
  try {
    const { studentIds } = req.body;

    // Validate input
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No students selected for invitation'
      });
    }

    if (studentIds.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send more than 50 invitations at once'
      });
    }

    console.log(`📧 Bulk invitation request for ${studentIds.length} students`);

    // Get student details from database
    const pool = await getPool();
    const request = pool.request();
    
    studentIds.forEach((id, index) => {
      request.input(`student${index}`, sql.Int, parseInt(id));
    });

    const placeholders = studentIds.map((_, index) => `@student${index}`).join(',');
    const studentsResult = await request.query(`
      SELECT Id, Name, Email 
      FROM Students 
      WHERE Id IN (${placeholders})
    `);

    const students = studentsResult.recordset;

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No students found with the provided IDs'
      });
    }

    console.log(`👥 Found ${students.length} students for invitation`);

    // Check for existing invitations to avoid duplicates
    const existingRequest = pool.request();
    studentIds.forEach((id, index) => {
      existingRequest.input(`existing${index}`, sql.Int, parseInt(id));
    });

    const existingInvitationsResult = await existingRequest.query(`
      SELECT DISTINCT StudentId 
      FROM Interviews 
      WHERE StudentId IN (${placeholders.replace(/student/g, 'existing')})
    `);

    const existingStudentIds = existingInvitationsResult.recordset.map(row => row.StudentId);
    const newStudents = students.filter(student => !existingStudentIds.includes(student.Id));

    if (newStudents.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All selected students have already been invited'
      });
    }

    if (newStudents.length < students.length) {
      console.log(`⚠️ ${students.length - newStudents.length} students already invited, sending to ${newStudents.length} new students`);
    }

    // Send bulk invitations using emailService
    const bulkResult = await emailService.sendBulkInvitations(newStudents);

    // Log the summary
    console.log(`📊 Bulk invitation completed:`, {
      totalAttempted: bulkResult.totalAttempted,
      successCount: bulkResult.successCount,
      errorCount: bulkResult.errorCount,
      provider: bulkResult.provider
    });

    // Prepare response message
    let message = '';
    if (bulkResult.success) {
      message = `All ${bulkResult.successCount} invitations sent successfully`;
    } else {
      message = `${bulkResult.successCount} sent successfully, ${bulkResult.errorCount} failed`;
    }

    res.json({
      success: bulkResult.success,
      message: message,
      data: {
        totalAttempted: bulkResult.totalAttempted,
        successCount: bulkResult.successCount,
        errorCount: bulkResult.errorCount,
        results: bulkResult.results,
        errors: bulkResult.errors,
        provider: bulkResult.provider,
        skippedExisting: students.length - newStudents.length
      }
    });

  } catch (error) {
    console.error('❌ Bulk invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send bulk invitations',
      error: error.message
    });
  }
},


  // Bulk download resumes - SIMPLE STUDENT NAMES ONLY
  downloadBulkResumes: async (req, res) => {
    try {
      const { studentIds } = req.body;
      
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ error: 'Student IDs array is required' });
      }

      const pool = await getPool();
      const request = pool.request();

      // Build parameterized query inputs
      studentIds.forEach((id, index) => {
        request.input(`id${index}`, sql.Int, parseInt(id));
      });

      const query = `
        SELECT Id, Name, Email, ResumeLink, ResumeFileName 
        FROM Students
        WHERE Id IN (${studentIds.map((_, i) => `@id${i}`).join(',')})
        AND ResumeLink IS NOT NULL
      `;

      const result = await request.query(query);

      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'No students with resumes found' });
      }

      // Create a zip file for bulk download
      const archiver = require('archiver');
      const archive = archiver('zip', { zlib: { level: 9 } });

      const timestamp = new Date().toISOString().split('T')[0];
      const zipFilename = `Resumes_${timestamp}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

      archive.pipe(res);

      let filesAdded = 0;
      let filesSkipped = 0;
      const processedNames = new Set();

      for (const student of result.recordset) {
        try {
          let resumePath = student.ResumeLink;

          // Handle different path formats
          if (student.ResumeLink.startsWith('http')) {
            const urlParts = student.ResumeLink.split('/');
            const filename = urlParts[urlParts.length - 1];
            resumePath = path.join(__dirname, '../uploads', filename);
          } else if (!path.isAbsolute(student.ResumeLink)) {
            resumePath = path.join(__dirname, '..', student.ResumeLink);
          }

          // Check if file exists
          if (fs.existsSync(resumePath)) {
            const fileExtension = path.extname(resumePath).toLowerCase();
            const cleanStudentName = student.Name
              .trim()
              .replace(/[^a-zA-Z0-9\s]/g, '')
              .replace(/\s+/g, '_')
              .substring(0, 50);

            // Handle duplicate names by adding a number
            let archiveFilename = `${cleanStudentName}${fileExtension}`;
            let counter = 1;
            while (processedNames.has(archiveFilename)) {
              archiveFilename = `${cleanStudentName}_${counter}${fileExtension}`;
              counter++;
            }
            processedNames.add(archiveFilename);
            
            archive.file(resumePath, { name: archiveFilename });
            filesAdded++;
          } else {
            filesSkipped++;
          }
        } catch (fileError) {
          filesSkipped++;
        }
      }

      archive.finalize();

      archive.on('error', (error) => {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to create resume archive' });
        }
      });

    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to process bulk download' });
      }
    }
  },

  // Upload Excel file & process
  uploadExcel: async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const filePath = req.file.path;
      const result = await excelService.processExcelFile(filePath);

      res.json({
        message: 'Excel file processed successfully',
        summary: result
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to process Excel file' });
    }
  },

  // Download sample Excel template
  downloadSampleExcel: async (req, res) => {
    try {
      const buffer = excelService.generateSampleExcel();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="student-template.xlsx"');
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate sample template' });
    }
  },

  // Send invitation emails
  sendInvitations: async (req, res) => {
    try {
      const { studentIds } = req.body;

      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ error: 'No student IDs provided' });
      }

      const pool = await getPool();
      const request = pool.request();

      // Build parameterized query inputs
      studentIds.forEach((id, index) => {
        request.input(`id${index}`, sql.Int, id);
      });

      const query = `
        SELECT * FROM Students
        WHERE Id IN (${studentIds.map((_, i) => `@id${i}`).join(',')})
      `;

      const students = await request.query(query);

      if (students.recordset.length === 0) {
        return res.status(404).json({ error: 'No students found for given IDs' });
      }

      // Send all invitations in parallel with error handling
      const invitationPromises = students.recordset.map(async (student) => {
        try {
          const result = await emailService.sendInvitationEmail(student);
          return { 
            success: true, 
            student: { id: student.Id, name: student.Name, email: student.Email },
            ...result 
          };
        } catch (err) {
          return { 
            success: false, 
            error: err.message, 
            student: { id: student.Id, name: student.Name, email: student.Email }
          };
        }
      });

      const results = await Promise.all(invitationPromises);
      
      // Count success/failure
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      res.json({
        message: 'Invitation process completed',
        summary: {
          total: results.length,
          successful,
          failed
        },
        results
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to send invitations', details: error.message });
    }
  },

  // Delete student by ID
  deleteStudent: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid student ID' });
      }

      const pool = await getPool();

      // Get student info before deletion (for file cleanup)
      const studentInfo = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT Name, ResumeLink FROM Students WHERE Id = @id');

      // Check if student is referenced by Interviews or other tables
      const refCheck = await pool.request()
        .input('id', sql.Int, id)
        .query(`
          SELECT COUNT(*) AS count,
          (SELECT TOP 1 Status FROM Interviews WHERE StudentId = @id) AS InterviewStatus
          FROM Interviews WHERE StudentId = @id
        `);

      if (refCheck.recordset[0].count > 0) {
        const interviewStatus = refCheck.recordset[0].InterviewStatus;
        const errorMessage = `Cannot delete student with ${interviewStatus.toLowerCase()} interview`;
        return res.status(400).json({ 
          error: errorMessage,
          interviewStatus: interviewStatus
        });
      }

      // Proceed to delete student
      const deleteResult = await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM Students WHERE Id = @id');

      if (deleteResult.rowsAffected[0] === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      // Clean up resume file if exists
      if (studentInfo.recordset.length > 0 && studentInfo.recordset[0].ResumeLink) {
        try {
          const resumePath = studentInfo.recordset[0].ResumeLink;
          let actualPath = resumePath;
          
          if (!path.isAbsolute(resumePath)) {
            actualPath = path.join(__dirname, '..', resumePath);
          }
          
          if (fs.existsSync(actualPath)) {
            fs.unlinkSync(actualPath);
          }
        } catch (fileError) {
          // Silent fail for file cleanup
        }
      }

      res.json({ message: 'Student deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to delete student' });
    }
  },

  // Bulk delete students by date range
  bulkDeleteByDate: async (req, res) => {
    try {
      const { start, end } = req.query;
      if (!start || !end) {
        return res.status(400).json({ error: 'Missing start or end date' });
      }
      
      const pool = await getPool();
      
      // First check how many students would be affected
      const checkResult = await pool.request()
        .input('start', sql.DateTime2, new Date(start))
        .input('end', sql.DateTime2, new Date(end))
        .query(`
          SELECT COUNT(*) as TotalCount,
          COUNT(i.Id) as WithInterviews
          FROM Students s
          LEFT JOIN Interviews i ON s.Id = i.StudentId
          WHERE s.CreatedAt BETWEEN @start AND @end
        `);

      const { TotalCount, WithInterviews } = checkResult.recordset[0];

      if (WithInterviews > 0) {
        return res.status(400).json({ 
          error: `Cannot delete students with interviews. ${WithInterviews} out of ${TotalCount} students have interview records.`,
          studentsWithInterviews: WithInterviews,
          totalStudents: TotalCount
        });
      }

      // Get resume files to clean up
      const resumeFiles = await pool.request()
        .input('start', sql.DateTime2, new Date(start))
        .input('end', sql.DateTime2, new Date(end))
        .query(`
          SELECT ResumeLink FROM Students 
          WHERE CreatedAt BETWEEN @start AND @end 
          AND ResumeLink IS NOT NULL
          AND Id NOT IN (SELECT DISTINCT StudentId FROM Interviews WHERE StudentId IS NOT NULL)
        `);

      // Proceed with deletion if no interviews found
      const result = await pool.request()
        .input('start', sql.DateTime2, new Date(start))
        .input('end', sql.DateTime2, new Date(end))
        .query(`
          DELETE FROM Students 
          WHERE CreatedAt BETWEEN @start AND @end
          AND Id NOT IN (SELECT DISTINCT StudentId FROM Interviews WHERE StudentId IS NOT NULL)
        `);

      // Clean up resume files
      let filesDeleted = 0;
      for (const row of resumeFiles.recordset) {
        try {
          let resumePath = row.ResumeLink;
          if (!path.isAbsolute(resumePath)) {
            resumePath = path.join(__dirname, '..', resumePath);
          }
          
          if (fs.existsSync(resumePath)) {
            fs.unlinkSync(resumePath);
            filesDeleted++;
          }
        } catch (fileError) {
          // Silent fail for file cleanup
        }
      }

      res.json({ 
        message: 'Students deleted successfully',
        deletedCount: result.rowsAffected[0],
        filesDeleted,
        dateRange: { start, end }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to bulk delete students' });
    }
  },

  // Get student interview status (for admin)
  getStudentInterviewStatus: async (req, res) => {
    try {
      const { studentId } = req.params;
      
      if (!studentId) {
        return res.status(400).json({ error: 'Student ID is required' });
      }

      const pool = await getPool();
      const result = await pool.request()
        .input('studentId', sql.Int, parseInt(studentId))
        .query(`
          SELECT 
            s.*,
            i.Status as InterviewStatus,
            i.InvitationToken,
            i.TokenExpiredAt,
            i.SlotId,
            i.Interviewer,
            i.MeetingLink,
            i.CreatedAt as InvitationSentAt,
            sl.SlotDateTime
          FROM Students s
          LEFT JOIN Interviews i ON s.Id = i.StudentId
          LEFT JOIN InterviewSlots sl ON i.SlotId = sl.Id
          WHERE s.Id = @studentId
        `);

      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const studentData = result.recordset[0];
      res.json({
        student: {
          id: studentData.Id,
          name: studentData.Name,
          email: studentData.Email,
          phone: studentData.Phone,
          hasResume: !!studentData.ResumeLink,
          resumeFileName: studentData.ResumeFileName
        },
        interview: {
          status: studentData.InterviewStatus || 'Not Invited',
          tokenExpired: !!studentData.TokenExpiredAt,
          tokenExpiredAt: studentData.TokenExpiredAt,
          slotId: studentData.SlotId,
          slotDateTime: studentData.SlotDateTime,
          interviewer: studentData.Interviewer,
          meetingLink: studentData.MeetingLink,
          invitationSentAt: studentData.InvitationSentAt
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch student status' });
    }
  }
};

module.exports = studentController;
