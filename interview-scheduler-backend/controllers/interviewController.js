 
const { getPool, sql } = require('../config/database');

const interviewController = {
    // Get all interviews
    getInterviews: async (req, res) => {
        try {
            const pool = await getPool();
            const result = await pool.request()
                .query(`
                    SELECT 
                        i.*,
                        s.Name as StudentName,
                        s.Email as StudentEmail,
                        slot.SlotDateTime
                    FROM Interviews i
                    JOIN Students s ON i.StudentId = s.Id
                    LEFT JOIN InterviewSlots slot ON i.SlotId = slot.Id
                    ORDER BY i.CreatedAt DESC
                `);
            
            res.json(result.recordset);
        } catch (error) {
            console.error('Error fetching interviews:', error);
            res.status(500).json({ error: 'Failed to fetch interviews' });
        }
    },

    // Get interview by ID
    getInterviewById: async (req, res) => {
        try {
            const { id } = req.params;
            const pool = await getPool();
            
            const result = await pool.request()
                .input('id', sql.Int, id)
                .query(`
                    SELECT 
                        i.*,
                        s.Name as StudentName,
                        s.Email as StudentEmail,
                        s.Phone as StudentPhone,
                        s.ResumeLink,
                        slot.SlotDateTime
                    FROM Interviews i
                    JOIN Students s ON i.StudentId = s.Id
                    LEFT JOIN InterviewSlots slot ON i.SlotId = slot.Id
                    WHERE i.Id = @id
                `);
            
            if (result.recordset.length === 0) {
                return res.status(404).json({ error: 'Interview not found' });
            }
            
            res.json(result.recordset[0]);
        } catch (error) {
            console.error('Error fetching interview:', error);
            res.status(500).json({ error: 'Failed to fetch interview' });
        }
    },

    // Update interview status
    updateInterviewStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;
            
            const validStatuses = ['Invited', 'Scheduled', 'Completed', 'Cancelled', 'No-Show'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: 'Invalid status' });
            }
            
            const pool = await getPool();
            await pool.request()
                .input('id', sql.Int, id)
                .input('status', sql.NVarChar, status)
                .query('UPDATE Interviews SET Status = @status WHERE Id = @id');
            
            res.json({ message: 'Interview status updated successfully' });
        } catch (error) {
            console.error('Error updating interview status:', error);
            res.status(500).json({ error: 'Failed to update interview status' });
        }
    },
    // Delete interview by ID
  deleteInterview: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid interview ID' });

      const pool = await getPool();
      await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM Interviews WHERE Id = @id');

      res.json({ message: 'Interview deleted successfully' });
    } catch (error) {
      console.error('Error deleting interview:', error);
      res.status(500).json({ error: 'Failed to delete interview' });
    }
},

};

module.exports = interviewController;
