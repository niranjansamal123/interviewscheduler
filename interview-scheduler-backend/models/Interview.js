 
const { getPool, sql } = require('../config/database');

class Interview {
    static async getAll() {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT i.*,
                s.Name AS StudentName,
                s.Email AS StudentEmail,
                slot.SlotDateTime
            FROM Interviews i
            JOIN Students s ON i.StudentId = s.Id
            LEFT JOIN InterviewSlots slot ON i.SlotId = slot.Id
            ORDER BY i.CreatedAt DESC
        `);
        return result.recordset;
    }

    static async create({ studentId, slotId, interviewer, meetingLink, status, invitationToken }) {
        const pool = await getPool();
        const result = await pool.request()
            .input('studentId', sql.Int, studentId)
            .input('slotId', sql.Int, slotId)
            .input('interviewer', sql.NVarChar, interviewer)
            .input('meetingLink', sql.NVarChar, meetingLink)
            .input('status', sql.NVarChar, status)
            .input('invitationToken', sql.NVarChar, invitationToken)
            .query(`
                INSERT INTO Interviews (StudentId, SlotId, Interviewer, MeetingLink, Status, InvitationToken)
                OUTPUT INSERTED.Id
                VALUES (@studentId, @slotId, @interviewer, @meetingLink, @status, @invitationToken)
            `);
        return result.recordset[0].Id;
    }

    static async updateStatus(id, status) {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, id)
            .input('status', sql.NVarChar, status)
            .query(`
                UPDATE Interviews
                SET Status = @status
                WHERE Id = @id
            `);
        return true;
    }

    static async getByInvitationToken(token) {
        const pool = await getPool();
        const result = await pool.request()
            .input('token', sql.NVarChar, token)
            .query(`
                SELECT *
                FROM Interviews
                WHERE InvitationToken = @token
            `);
        return result.recordset[0];
    }
}

module.exports = Interview;
