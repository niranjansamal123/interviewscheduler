const { getPool, sql } = require('../config/database');

const slotController = {
    // Create new interview slot
    createSlot: async (req, res) => {
        try {
            const { slotDateTime, interviewer, meetingLink } = req.body;
            
            if (!slotDateTime || !interviewer) {
                return res.status(400).json({ error: 'Slot date/time and interviewer are required' });
            }
            
            const pool = await getPool();
            
            // Check for duplicate slot
            const checkResult = await pool.request()
                .input('slotDateTime', sql.DateTime2, new Date(slotDateTime))
                .query('SELECT Id FROM InterviewSlots WHERE SlotDateTime = @slotDateTime');

            if (checkResult.recordset.length > 0) {
                return res.status(400).json({ error: 'A slot already exists at this date and time' });
            }
            
            const result = await pool.request()
                .input('slotDateTime', sql.DateTime2, new Date(slotDateTime))
                .input('interviewer', sql.NVarChar, interviewer)
                .input('meetingLink', sql.NVarChar, meetingLink || null)
                .query(`
                    INSERT INTO InterviewSlots (SlotDateTime, Interviewer, MeetingLink, CreatedAt)
                    VALUES (@slotDateTime, @interviewer, @meetingLink, GETDATE());
                    SELECT SCOPE_IDENTITY() as Id;
                `);
            
            console.log('✅ Slot created:', new Date(slotDateTime).toLocaleString(), 'by', interviewer);
            
            res.status(201).json({
                message: 'Interview slot created successfully',
                slotId: result.recordset[0].Id,
                slotDateTime: slotDateTime,
                interviewer: interviewer
            });
        } catch (error) {
            console.error('❌ Error creating slot:', error);
            res.status(500).json({ error: 'Failed to create slot' });
        }
    },

    // NEW: Create multiple slots at once
    // ENHANCED: Create multiple slots at once
createBulkSlots: async (req, res) => {
    try {
        console.log('📅 Bulk slot creation request received');
        console.log('📋 Request body:', JSON.stringify(req.body, null, 2));

        const { slots } = req.body;
        
        if (!slots) {
            console.log('❌ No slots field in request body');
            return res.status(400).json({ error: 'Slots field is required in request body' });
        }

        if (!Array.isArray(slots)) {
            console.log('❌ Slots is not an array:', typeof slots);
            return res.status(400).json({ error: 'Slots must be an array' });
        }

        if (slots.length === 0) {
            console.log('❌ Empty slots array');
            return res.status(400).json({ error: 'Slots array cannot be empty' });
        }

        if (slots.length > 500) {
            console.log('❌ Too many slots:', slots.length);
            return res.status(400).json({ error: 'Cannot create more than 500 slots at once' });
        }

        console.log('✅ Basic validation passed. Processing', slots.length, 'slots');

        const pool = await getPool();
        const results = {
            total: slots.length,
            successful: 0,
            failed: 0,
            duplicates: 0,
            errors: []
        };

        // Process each slot
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            console.log(`📝 Processing slot ${i + 1}/${slots.length}:`, slot);

            try {
                // Validate required fields
                if (!slot.slotDateTime) {
                    throw new Error('SlotDateTime is required');
                }
                if (!slot.interviewer) {
                    throw new Error('Interviewer is required');
                }

                const slotDate = new Date(slot.slotDateTime);
                if (isNaN(slotDate.getTime())) {
                    throw new Error(`Invalid date format: ${slot.slotDateTime}`);
                }

                // Check if slot is in the past
                if (slotDate <= new Date()) {
                    throw new Error('Slot date must be in the future');
                }

                console.log(`✅ Slot ${i + 1} validation passed:`, slotDate.toLocaleString());

                // Check for duplicate slot
                const checkResult = await pool.request()
                    .input('slotDateTime', sql.DateTime2, slotDate)
                    .query('SELECT Id FROM InterviewSlots WHERE SlotDateTime = @slotDateTime');

                if (checkResult.recordset.length > 0) {
                    results.duplicates++;
                    results.errors.push({
                        index: i + 1,
                        slotDateTime: slot.slotDateTime,
                        error: 'Slot already exists at this date and time'
                    });
                    console.log(`⚠️ Slot ${i + 1} is duplicate:`, slotDate.toLocaleString());
                    continue;
                }

                // Create slot
                await pool.request()
                    .input('slotDateTime', sql.DateTime2, slotDate)
                    .input('interviewer', sql.NVarChar, slot.interviewer.trim())
                    .input('meetingLink', sql.NVarChar, slot.meetingLink?.trim() || null)
                    .query(`
                        INSERT INTO InterviewSlots (SlotDateTime, Interviewer, MeetingLink, CreatedAt)
                        VALUES (@slotDateTime, @interviewer, @meetingLink, GETDATE())
                    `);

                results.successful++;
                console.log(`✅ Slot ${i + 1}/${slots.length} created successfully:`, slotDate.toLocaleString());

            } catch (error) {
                results.failed++;
                results.errors.push({
                    index: i + 1,
                    slotDateTime: slot.slotDateTime || 'N/A',
                    interviewer: slot.interviewer || 'N/A',
                    error: error.message
                });
                console.error(`❌ Slot ${i + 1} failed:`, error.message);
            }
        }

        console.log('📊 Bulk slot creation completed:', {
            total: results.total,
            successful: results.successful,
            failed: results.failed,
            duplicates: results.duplicates,
            errors: results.errors
        });

        // Determine response status based on results
        let status = 200;
        if (results.successful === 0) {
            status = 400; // No slots created
        } else if (results.failed > 0 || results.duplicates > 0) {
            status = 207; // Partial success
        }

        res.status(status).json({
            message: 'Bulk slot creation completed',
            summary: results
        });

    } catch (error) {
        console.error('❌ Error creating bulk slots:', error);
        console.error('❌ Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Failed to create bulk slots',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
},

    // Get all slots
    getSlots: async (req, res) => {
        try {
            const pool = await getPool();
            const result = await pool.request()
                .query(`
                    SELECT 
                        s.*,
                        st.Name as StudentName,
                        st.Email as StudentEmail
                    FROM InterviewSlots s
                    LEFT JOIN Students st ON s.BookedByStudentId = st.Id
                    ORDER BY s.SlotDateTime ASC
                `);
            
            res.json(result.recordset);
        } catch (error) {
            console.error('❌ Error fetching slots:', error);
            res.status(500).json({ error: 'Failed to fetch slots' });
        }
    },

    // Get available slots - INCLUDES TODAY'S SLOTS
    getAvailableSlots: async (req, res) => {
        try {
            const pool = await getPool();
            
            const result = await pool.request()
                .query(`
                    DECLARE @Today DATE = CAST(GETDATE() AS DATE);
                    DECLARE @CurrentTime DATETIME2 = GETDATE();
                    
                    SELECT 
                        Id,
                        SlotDateTime,
                        Interviewer,
                        MeetingLink,
                        IsBooked,
                        BookedByStudentId,
                        CreatedAt,
                        @CurrentTime as CurrentTime
                    FROM InterviewSlots 
                    WHERE IsBooked = 0 
                    AND (
                        -- Future dates (tomorrow onwards) - show all
                        CAST(SlotDateTime AS DATE) > @Today
                        OR 
                        -- Today's slots - show only if they haven't started yet (with 30-min buffer)
                        (CAST(SlotDateTime AS DATE) = @Today 
                         AND SlotDateTime >= DATEADD(MINUTE, -30, @CurrentTime))
                    )
                    ORDER BY SlotDateTime ASC
                `);
            
            console.log('📊 Available slots found:', result.recordset.length);
            res.json(result.recordset);
        } catch (error) {
            console.error('❌ Error fetching available slots:', error);
            res.status(500).json({ error: 'Failed to fetch available slots' });
        }
    },

    // NEW: Get slots by date range
    getSlotsByDateRange: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            
            if (!startDate || !endDate) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const pool = await getPool();
            const result = await pool.request()
                .input('startDate', sql.Date, new Date(startDate))
                .input('endDate', sql.Date, new Date(endDate))
                .query(`
                    SELECT 
                        s.*,
                        st.Name as StudentName,
                        st.Email as StudentEmail
                    FROM InterviewSlots s
                    LEFT JOIN Students st ON s.BookedByStudentId = st.Id
                    WHERE CAST(s.SlotDateTime AS DATE) BETWEEN @startDate AND @endDate
                    ORDER BY s.SlotDateTime ASC
                `);
            
            res.json(result.recordset);
        } catch (error) {
            console.error('❌ Error fetching slots by date range:', error);
            res.status(500).json({ error: 'Failed to fetch slots by date range' });
        }
    },

    // NEW: Get slots by interviewer
    getSlotsByInterviewer: async (req, res) => {
        try {
            const { interviewer } = req.query;
            
            if (!interviewer) {
                return res.status(400).json({ error: 'Interviewer name is required' });
            }

            const pool = await getPool();
            const result = await pool.request()
                .input('interviewer', sql.NVarChar, interviewer)
                .query(`
                    SELECT 
                        s.*,
                        st.Name as StudentName,
                        st.Email as StudentEmail
                    FROM InterviewSlots s
                    LEFT JOIN Students st ON s.BookedByStudentId = st.Id
                    WHERE s.Interviewer = @interviewer
                    ORDER BY s.SlotDateTime ASC
                `);
            
            res.json(result.recordset);
        } catch (error) {
            console.error('❌ Error fetching slots by interviewer:', error);
            res.status(500).json({ error: 'Failed to fetch slots by interviewer' });
        }
    },

    // Book a slot - WITH TOKEN EXPIRATION
    bookSlot: async (req, res) => {
        try {
            const { slotId, token } = req.body;
            
            console.log('📅 Booking request received:', { 
                slotId, 
                token: token ? `${token.substring(0, 10)}...` : 'missing',
                timestamp: new Date().toISOString()
            });

            // Validate input
            if (!slotId || !token) {
                console.log('❌ Missing required fields:', { slotId: !!slotId, token: !!token });
                return res.status(400).json({ error: "Slot ID and token are required" });
            }

            const pool = await getPool();

            // 1. Verify token and get student info (with expiration check)
            console.log('🔍 Verifying token...');
            const tokenResult = await pool.request()
                .input("token", sql.NVarChar, token)
                .query(`
                    SELECT 
                        i.Id as InterviewId,
                        i.StudentId, 
                        i.Status as InterviewStatus,
                        i.TokenExpiredAt,
                        i.SlotId as ExistingSlotId,
                        s.Name, 
                        s.Email, 
                        s.Phone, 
                        s.ResumeLink
                    FROM Interviews i
                    JOIN Students s ON s.Id = i.StudentId
                    WHERE i.InvitationToken = @token
                `);

            if (tokenResult.recordset.length === 0) {
                console.log('❌ Token not found:', token);
                return res.status(400).json({ error: "Invalid or expired invitation token" });
            }

            const student = tokenResult.recordset[0];
            console.log('✅ Student found:', student.Name, student.Email);

            // 2. Check if token is already expired
            if (student.TokenExpiredAt) {
                console.log('❌ Token already expired:', student.TokenExpiredAt);
                return res.status(410).json({ 
                    error: "This invitation link has already been used and is no longer valid",
                    expiredAt: student.TokenExpiredAt,
                    reason: "Link was used to book an interview slot"
                });
            }

            // 3. Check if student already has a slot booked
            if (student.ExistingSlotId) {
                console.log('❌ Student already has slot booked:', student.ExistingSlotId);
                return res.status(409).json({ 
                    error: "You have already booked an interview slot with this invitation",
                    existingSlotId: student.ExistingSlotId
                });
            }

            // 4. Check if student has uploaded resume (MANDATORY CHECK)
            if (!student.ResumeLink) {
                console.log('❌ Resume not uploaded for student:', student.Name);
                return res.status(400).json({ error: "Please upload your resume before booking a slot" });
            }

            // 5. Check if interview status allows booking
            if (student.InterviewStatus !== 'Invited') {
                console.log('❌ Invalid interview status:', student.InterviewStatus);
                return res.status(400).json({ 
                    error: `Interview status is ${student.InterviewStatus}. Cannot book slot.`
                });
            }

            // 6. Check if slot is still available
            console.log('🔍 Checking slot availability...');
            const slotResult = await pool.request()
                .input("slotId", sql.Int, parseInt(slotId))
                .query(`
                    DECLARE @Today DATE = CAST(GETDATE() AS DATE);
                    DECLARE @CurrentTime DATETIME2 = GETDATE();
                    
                    SELECT * FROM InterviewSlots 
                    WHERE Id = @slotId 
                    AND IsBooked = 0 
                    AND (
                        -- Future dates
                        CAST(SlotDateTime AS DATE) > @Today
                        OR 
                        -- Today's slots with 15-min buffer
                        (CAST(SlotDateTime AS DATE) = @Today 
                         AND SlotDateTime >= DATEADD(MINUTE, -15, @CurrentTime))
                    )
                `);

            if (slotResult.recordset.length === 0) {
                console.log('❌ Slot not available:', slotId);
                return res.status(400).json({ error: "Slot is no longer available or has passed" });
            }

            const slot = slotResult.recordset[0];
            console.log('✅ Slot available:', new Date(slot.SlotDateTime).toLocaleString());

            // 7. Start transaction for booking AND token expiration
            console.log('💾 Starting booking transaction...');
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                const currentDateTime = new Date();
                
                // Mark slot as booked
                const slotUpdateResult = await transaction.request()
                    .input("slotId", sql.Int, parseInt(slotId))
                    .input("studentId", sql.Int, student.StudentId)
                    .query(`
                        UPDATE InterviewSlots 
                        SET IsBooked = 1, BookedByStudentId = @studentId
                        WHERE Id = @slotId AND IsBooked = 0
                    `);

                // Check if slot was actually updated (race condition check)
                if (slotUpdateResult.rowsAffected[0] === 0) {
                    await transaction.rollback();
                    console.log('❌ Slot was booked by another user:', slotId);
                    return res.status(409).json({ error: "Slot was just booked by another user. Please select another slot." });
                }

                // Use existing slot info or generate defaults
                const meetingLink = slot.MeetingLink || process.env.MEETING_LINK || `https://meet.google.com/new-${Date.now()}`;
                const interviewer = slot.Interviewer || "HR Team";

                // Update interview record AND expire the token
                await transaction.request()
                    .input("token", sql.NVarChar, token)
                    .input("slotId", sql.Int, parseInt(slotId))
                    .input("interviewer", sql.NVarChar, interviewer)
                    .input("meetingLink", sql.NVarChar, meetingLink)
                    .input("expiredAt", sql.DateTime2, currentDateTime)
                    .input("updatedAt", sql.DateTime2, currentDateTime)
                    .query(`
                        UPDATE Interviews 
                        SET SlotId = @slotId, 
                            Interviewer = @interviewer, 
                            MeetingLink = @meetingLink, 
                            Status = 'Scheduled',
                            TokenExpiredAt = @expiredAt,
                            UpdatedAt = @updatedAt
                        WHERE InvitationToken = @token
                        AND TokenExpiredAt IS NULL
                    `);

                await transaction.commit();
                console.log('✅ Slot booked and token expired for:', student.Name);

                // Send confirmation email (don't fail booking if email fails)
                try {
                    const emailService = require("../services/emailService");
                    await emailService.sendConfirmationEmail(student, slot, interviewer, meetingLink);
                    console.log('📧 Confirmation email sent');
                } catch (emailError) {
                    console.error('⚠️ Failed to send confirmation email:', emailError.message);
                    // Log but don't fail the booking
                }

                // Log successful booking for audit
                console.log('📝 Booking audit log:', {
                    studentId: student.StudentId,
                    studentName: student.Name,
                    slotId: parseInt(slotId),
                    slotDateTime: slot.SlotDateTime,
                    tokenExpiredAt: currentDateTime,
                    meetingLink
                });

                res.json({
                    message: "Interview slot booked successfully",
                    slotDateTime: slot.SlotDateTime,
                    meetingLink,
                    studentName: student.Name,
                    interviewer,
                    tokenExpired: true, // Indicate that token is now expired
                    bookingId: student.InterviewId
                });

            } catch (error) {
                await transaction.rollback();
                console.error('❌ Transaction failed:', error);
                
                // Check for specific SQL errors
                if (error.message.includes('UNIQUE KEY')) {
                    return res.status(409).json({ error: "This slot is already booked. Please select another slot." });
                }
                
                throw error;
            }

        } catch (error) {
            console.error("❌ Error booking slot:", error);
            res.status(500).json({ 
                error: "Failed to book slot. Please try again.",
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    },

    // Delete slot by ID
    // ENHANCED: Delete slot by ID with detailed debugging
deleteSlot: async (req, res) => {
    try {
        console.log('🗑️ === DELETE SLOT DEBUG START ===');
        console.log('📋 Delete request for slot ID:', req.params.id);
        
        const id = parseInt(req.params.id);
        if (isNaN(id) || id <= 0) {
            console.log('❌ Invalid slot ID format:', req.params.id);
            return res.status(400).json({ error: 'Invalid slot ID format' });
        }

        console.log('✅ Slot ID validated:', id);

        const pool = await getPool();
        console.log('✅ Database connection successful');
        
        // First, get detailed information about the slot
        console.log('🔍 Checking slot details...');
        const slotInfo = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT 
                    s.Id,
                    s.SlotDateTime,
                    s.Interviewer,
                    s.IsBooked,
                    s.BookedByStudentId,
                    s.CreatedAt,
                    st.Name as StudentName,
                    st.Email as StudentEmail,
                    i.Status as InterviewStatus,
                    i.Id as InterviewId
                FROM InterviewSlots s
                LEFT JOIN Students st ON s.BookedByStudentId = st.Id
                LEFT JOIN Interviews i ON i.SlotId = s.Id
                WHERE s.Id = @id
            `);

        if (slotInfo.recordset.length === 0) {
            console.log('❌ Slot not found with ID:', id);
            return res.status(404).json({ error: 'Slot not found' });
        }

        const slot = slotInfo.recordset[0];
        console.log('📋 Slot details:', {
            id: slot.Id,
            dateTime: new Date(slot.SlotDateTime).toLocaleString(),
            interviewer: slot.Interviewer,
            isBooked: slot.IsBooked,
            studentName: slot.StudentName,
            studentEmail: slot.StudentEmail,
            interviewStatus: slot.InterviewStatus,
            interviewId: slot.InterviewId
        });

        // Check if slot is booked or has an associated interview
        if (slot.IsBooked || slot.BookedByStudentId || slot.InterviewId) {
            console.log('❌ Cannot delete slot - it is booked or has an interview');
            
            // Provide detailed error message
            let errorMessage = 'Cannot delete this slot because it ';
            const reasons = [];
            
            if (slot.IsBooked) reasons.push('is marked as booked');
            if (slot.StudentName) reasons.push(`is booked by ${slot.StudentName}`);
            if (slot.InterviewStatus) reasons.push(`has an interview with status: ${slot.InterviewStatus}`);
            
            errorMessage += reasons.join(' and ');
            errorMessage += '. Please cancel the booking first or contact the student.';
            
            return res.status(400).json({ 
                error: errorMessage,
                details: {
                    isBooked: slot.IsBooked,
                    studentName: slot.StudentName,
                    studentEmail: slot.StudentEmail,
                    interviewStatus: slot.InterviewStatus,
                    slotDateTime: slot.SlotDateTime
                }
            });
        }

        // Proceed with deletion
        console.log('✅ Slot is available for deletion');
        console.log('🗑️ Attempting to delete slot...');
        
        const deleteResult = await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM InterviewSlots WHERE Id = @id AND IsBooked = 0');

        console.log('📊 Delete result:', {
            rowsAffected: deleteResult.rowsAffected[0],
            recordset: deleteResult.recordset
        });

        if (deleteResult.rowsAffected[0] === 0) {
            console.log('❌ No rows deleted - slot may have been booked by another user');
            return res.status(400).json({ 
                error: 'Slot could not be deleted. It may have been booked by another user just now.' 
            });
        }

        console.log('✅ Slot deleted successfully:', id);
        console.log('🗑️ === DELETE SLOT DEBUG END ===');
        
        res.json({ 
            message: 'Slot deleted successfully',
            deletedSlot: {
                id: slot.Id,
                dateTime: slot.SlotDateTime,
                interviewer: slot.Interviewer
            }
        });
        
    } catch (error) {
        console.error('❌ Error deleting slot:', error);
        console.error('❌ Error stack:', error.stack);
        
        // Provide specific error messages based on the error type
        if (error.message.includes('REFERENCE constraint')) {
            return res.status(400).json({ 
                error: 'Cannot delete slot because it is referenced by other records (interviews, bookings, etc.)',
                details: 'This slot has associated data that prevents deletion'
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to delete slot due to server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
},


    // NEW: Bulk delete slots
    deleteBulkSlots: async (req, res) => {
        try {
            const { slotIds } = req.body;
            
            if (!Array.isArray(slotIds) || slotIds.length === 0) {
                return res.status(400).json({ error: 'Slot IDs array is required' });
            }

            console.log('🗑️ Deleting bulk slots:', slotIds.length);

            const pool = await getPool();
            const results = {
                total: slotIds.length,
                successful: 0,
                failed: 0,
                booked: 0,
                errors: []
            };

            for (const id of slotIds) {
                try {
                    const slotId = parseInt(id);
                    if (isNaN(slotId)) {
                        throw new Error('Invalid slot ID format');
                    }

                    // Check if slot is booked
                    const checkResult = await pool.request()
                        .input('id', sql.Int, slotId)
                        .query('SELECT IsBooked FROM InterviewSlots WHERE Id = @id');

                    if (checkResult.recordset.length === 0) {
                        throw new Error('Slot not found');
                    }

                    if (checkResult.recordset[0].IsBooked) {
                        results.booked++;
                        results.errors.push({
                            slotId: slotId,
                            error: 'Cannot delete booked slot'
                        });
                        continue;
                    }

                    // Delete the slot
                    const deleteResult = await pool.request()
                        .input('id', sql.Int, slotId)
                        .query('DELETE FROM InterviewSlots WHERE Id = @id AND IsBooked = 0');

                    if (deleteResult.rowsAffected[0] > 0) {
                        results.successful++;
                    } else {
                        results.failed++;
                    }

                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        slotId: id,
                        error: error.message
                    });
                }
            }

            console.log('📊 Bulk delete completed:', results);

            res.json({
                message: 'Bulk slot deletion completed',
                summary: results
            });

        } catch (error) {
            console.error('❌ Error deleting bulk slots:', error);
            res.status(500).json({ error: 'Failed to delete bulk slots' });
        }
    },

    // Cancel booking (for admin use)
    cancelBooking: async (req, res) => {
        try {
            const { slotId } = req.params;
            const { reason } = req.body;

            if (!slotId) {
                return res.status(400).json({ error: 'Slot ID is required' });
            }

            const pool = await getPool();
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                // Get booking details
                const bookingResult = await transaction.request()
                    .input('slotId', sql.Int, parseInt(slotId))
                    .query(`
                        SELECT s.*, st.Name, st.Email, i.Id as InterviewId
                        FROM InterviewSlots s
                        LEFT JOIN Students st ON s.BookedByStudentId = st.Id
                        LEFT JOIN Interviews i ON i.SlotId = s.Id
                        WHERE s.Id = @slotId AND s.IsBooked = 1
                    `);

                if (bookingResult.recordset.length === 0) {
                    await transaction.rollback();
                    return res.status(404).json({ error: 'Booked slot not found' });
                }

                const booking = bookingResult.recordset[0];

                // Free up the slot
                await transaction.request()
                    .input('slotId', sql.Int, parseInt(slotId))
                    .query(`
                        UPDATE InterviewSlots 
                        SET IsBooked = 0, BookedByStudentId = NULL 
                        WHERE Id = @slotId
                    `);

                // Update interview status
                if (booking.InterviewId) {
                    await transaction.request()
                        .input('interviewId', sql.Int, booking.InterviewId)
                        .input('reason', sql.NVarChar, reason || 'Booking cancelled by admin')
                        .query(`
                            UPDATE Interviews 
                            SET Status = 'Cancelled', 
                                SlotId = NULL, 
                                Notes = @reason,
                                UpdatedAt = GETDATE()
                            WHERE Id = @interviewId
                        `);
                }

                await transaction.commit();
                console.log('🚫 Booking cancelled for slot:', slotId);

                res.json({
                    message: 'Booking cancelled successfully',
                    slotId: parseInt(slotId),
                    studentName: booking.Name,
                    reason: reason || 'Booking cancelled by admin'
                });

            } catch (error) {
                await transaction.rollback();
                throw error;
            }

        } catch (error) {
            console.error('❌ Error cancelling booking:', error);
            res.status(500).json({ error: 'Failed to cancel booking' });
        }
    }
};

module.exports = slotController;
