 
const { getPool, sql } = require('../config/database');

class Student {
    static async getAll() {
        const pool = await getPool();
        const result = await pool.request().query('SELECT * FROM Students');
        return result.recordset;
    }

    static async getById(id) {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM Students WHERE Id = @id');
        return result.recordset[0];
    }

    static async create({ name, email, phone, resumeLink }) {
        const pool = await getPool();
        const result = await pool.request()
            .input('name', sql.NVarChar, name)
            .input('email', sql.NVarChar, email)
            .input('phone', sql.NVarChar, phone)
            .input('resumeLink', sql.NVarChar, resumeLink)
            .query(`
                INSERT INTO Students (Name, Email, Phone, ResumeLink)
                OUTPUT INSERTED.Id
                VALUES (@name, @email, @phone, @resumeLink)
            `);
        return result.recordset[0].Id;
    }

    static async update(id, { name, email, phone, resumeLink }) {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, id)
            .input('name', sql.NVarChar, name)
            .input('email', sql.NVarChar, email)
            .input('phone', sql.NVarChar, phone)
            .input('resumeLink', sql.NVarChar, resumeLink)
            .query(`
                UPDATE Students
                SET Name = @name, Email = @email, Phone = @phone, ResumeLink = @resumeLink
                WHERE Id = @id
            `);
        return true;
    }

    static async delete(id) {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Students WHERE Id = @id');
        return true;
    }
}

module.exports = Student;
