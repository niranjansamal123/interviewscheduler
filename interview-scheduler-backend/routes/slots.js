const express = require('express');
const router = express.Router();
const slotController = require('../controllers/slotController');

// ⚠️ IMPORTANT: Specific routes BEFORE parameterized routes

// Bulk operations (most specific first)
router.post('/bulk', slotController.createBulkSlots);
router.delete('/bulk', slotController.deleteBulkSlots);

// Query routes with parameters
router.get('/available', slotController.getAvailableSlots);
router.get('/range', slotController.getSlotsByDateRange);
router.get('/interviewer', slotController.getSlotsByInterviewer);

// Booking operations
router.post('/book', slotController.bookSlot);

// Standard CRUD routes
router.get('/', slotController.getSlots);
router.post('/', slotController.createSlot);

// Parameterized routes LAST
router.delete('/:id', slotController.deleteSlot);
router.delete('/:slotId/cancel', slotController.cancelBooking);

module.exports = router;
