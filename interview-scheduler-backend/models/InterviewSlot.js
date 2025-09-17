 
const { getPool, sql } = require('../config/database');

class InterviewSlot {
    static async getAll() {
        const pool = await getPool();
        const result = await pool.request().query('SELECT * FROM InterviewSlots ORDER BY SlotDateTime ASC');
        return result.recordset;
    }

    static async getAvailableSlots() {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT * FROM InterviewSlots
            WHERE IsBooked = 0 AND SlotDateTime > GETDATE()
            ORDER BY SlotDateTime ASC
        `);
        return result.recordset;
    }

    static async create(slotDateTime) {
        const pool = await getPool();
        const result = await pool.request()
            .input('slotDateTime', sql.DateTime2, slotDateTime)
            .query(`
                INSERT INTO InterviewSlots (SlotDateTime)
                OUTPUT INSERTED.Id
                VALUES (@slotDateTime)
            `);
        return result.recordset[0].Id;
    }

    static async markBooked(slotId, studentId) {
        const pool = await getPool();
        await pool.request()
            .input('slotId', sql.Int, slotId)
            .input('studentId', sql.Int, studentId)
            .query(`
                UPDATE InterviewSlots
                SET IsBooked = 1, BookedByStudentId = @studentId
                WHERE Id = @slotId
            `);
        return true;
    }
}

module.exports = InterviewSlot;
