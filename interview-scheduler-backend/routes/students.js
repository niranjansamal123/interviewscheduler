const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

// Get upload middleware from app
const getUploadMiddleware = (req, res, next) => {
    const upload = req.app.get('upload');
    upload.single('excel')(req, res, next);
};

// Get resume upload middleware
const getResumeUploadMiddleware = (req, res, next) => {
    const upload = req.app.get('upload');
    upload.single('resume')(req, res, next);
};

// ⚠️ IMPORTANT: Specific routes BEFORE parameterized routes
// Token-based routes (for slot selection)
router.get('/by-token/:token', studentController.getStudentByToken);
router.put('/resume/:token', getResumeUploadMiddleware, studentController.updateResume);

// Resume download routes
router.get('/:studentId/resume/download', studentController.downloadResume);
router.post('/bulk-download-resumes', studentController.downloadBulkResumes);

// Student interview status route (for admin)
router.get('/:studentId/status', studentController.getStudentInterviewStatus);

// Template and bulk routes
router.get('/sample-template', studentController.downloadSampleExcel);
router.delete('/bulk', studentController.bulkDeleteByDate);

// Standard CRUD routes
router.get('/', studentController.getStudents);
router.post('/', studentController.addStudent);
router.post('/upload-excel', getUploadMiddleware, studentController.uploadExcel);

// NEW: Bulk invitations route
router.post('/send-bulk-invitations', studentController.sendBulkInvitations);


// OLD: Keep for backward compatibility
router.post('/send-invitations', studentController.sendInvitations);

// Parameterized routes LAST
router.delete('/:id', studentController.deleteStudent);

module.exports = router;
