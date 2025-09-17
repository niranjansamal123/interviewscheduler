 
const crypto = require('crypto');
const { getPool, sql } = require('../config/database');

const tokenService = {
    generateSecureToken: () => {
        return crypto.randomBytes(32).toString('hex');
    },

    verifyToken: async (token) => {
        try {
            const pool = await getPool();
            const result = await pool.request()
                .input('token', sql.NVarChar, token)
                .query(`
                    SELECT 
                        i.*,
                        s.Name as StudentName,
                        s.Email as StudentEmail
                    FROM Interviews i
                    JOIN Students s ON i.StudentId = s.Id
                    WHERE i.InvitationToken = @token AND i.Status = 'Invited'
                `);
            
            return result.recordset.length > 0 ? result.recordset[0] : null;
        } catch (error) {
            console.error('Error verifying token:', error);
            return null;
        }
    },

    invalidateToken: async (token) => {
        try {
            const pool = await getPool();
            await pool.request()
                .input('token', sql.NVarChar, token)
                .query('UPDATE Interviews SET InvitationToken = NULL WHERE InvitationToken = @token');
            
            return true;
        } catch (error) {
            console.error('Error invalidating token:', error);
            return false;
        }
    }
};

module.exports = tokenService;
