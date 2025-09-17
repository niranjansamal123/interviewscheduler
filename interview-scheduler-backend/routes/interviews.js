 
const express = require('express');
const router = express.Router();
const interviewController = require('../controllers/interviewController');

// Routes
router.get('/', interviewController.getInterviews);
router.get('/:id', interviewController.getInterviewById);
router.put('/:id/status', interviewController.updateInterviewStatus);
// For interviews (e.g., in interviews router)
router.delete('/:id', interviewController.deleteInterview);

module.exports = router;
