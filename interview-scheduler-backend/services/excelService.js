const XLSX = require('xlsx');
const { getPool, sql } = require('../config/database');

const excelService = {
    // Generate sample Excel template WITHOUT resume column
    generateSampleExcel: () => {
        try {
            console.log('📄 Generating sample Excel template without resume column...');
            
            const sampleData = [
                {
                    'Full Name': 'John Doe',
                    'Email Address': 'john.doe@email.com',
                    'Phone Number': '+1 234 567 8900'
                    // NO Resume Link column
                },
                {
                    'Full Name': 'Jane Smith',
                    'Email Address': 'jane.smith@email.com',
                    'Phone Number': '+1 234 567 8901'
                },
                {
                    'Full Name': 'Michael Johnson',
                    'Email Address': 'mike.johnson@email.com',
                    'Phone Number': '+44 20 7946 0958'
                },
                {
                    'Full Name': 'Sarah Williams',
                    'Email Address': 'sarah.williams@email.com',
                    'Phone Number': '+91 98765 43210'
                },
                {
                    'Full Name': 'David Brown',
                    'Email Address': 'david.brown@email.com',
                    'Phone Number': '+1 555 123 4567'
                }
            ];
            
            const worksheet = XLSX.utils.json_to_sheet(sampleData);
            
            // Set column widths for better readability (ONLY 3 columns now)
            worksheet['!cols'] = [
                { wch: 25 }, // Full Name - wider for longer names
                { wch: 35 }, // Email Address - wider for longer emails
                { wch: 20 }  // Phone Number
            ];

            // Add header styling
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const address = XLSX.utils.encode_cell({ r: 0, c: C });
                if (!worksheet[address]) continue;
                worksheet[address].s = {
                    font: { bold: true, color: { rgb: "FFFFFF" } },
                    fill: { fgColor: { rgb: "4472C4" } }, // Blue header
                    alignment: { horizontal: "center" }
                };
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
            
            // Add metadata to workbook
            workbook.Props = {
                Title: "Student Import Template",
                Subject: "Template for bulk student import - Name, Email, Phone only",
                Author: "Interview Scheduler System",
                CreatedDate: new Date(),
                Comments: "Upload students without resumes. Resumes will be collected during interview invitation process."
            };
            
            console.log('✅ Sample Excel template generated successfully (3 columns only)');
            return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            
        } catch (error) {
            console.error('❌ Error generating sample Excel:', error);
            throw new Error('Failed to generate sample Excel template: ' + error.message);
        }
    },

    // Process Excel file WITHOUT resume column validation
    processExcelFile: async (filePath) => {
        try {
            console.log('📊 Processing Excel file:', filePath);
            
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet);
            
            console.log('📋 Raw data from Excel:', data.length, 'rows');

            if (data.length === 0) {
                throw new Error('Excel file is empty or has no valid data');
            }

            const pool = await getPool();
            const results = {
                total: data.length,
                successful: 0,
                failed: 0,
                duplicates: 0,
                errors: [],
                processed: []
            };
            
            // Process each row
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                const rowNumber = i + 2; // Excel row number (accounting for header)
                
                try {
                    // Extract and normalize field names (support multiple column name formats)
                    const name = row['Full Name'] || row['Name'] || row['Student Name'] || '';
                    const email = row['Email Address'] || row['Email'] || row['Student Email'] || '';
                    const phone = row['Phone Number'] || row['Phone'] || row['Mobile Number'] || row['Contact Number'] || '';

                    // Validate required fields
                    if (!name || typeof name !== 'string' || !name.trim()) {
                        throw new Error('Name is required and must be a valid text');
                    }
                    
                    if (!email || typeof email !== 'string' || !email.trim()) {
                        throw new Error('Email is required and must be a valid text');
                    }

                    if (!phone || typeof phone !== 'string' || !phone.trim()) {
                        throw new Error('Phone number is required and must be a valid text');
                    }

                    // Clean and validate data
                    const cleanName = name.trim();
                    const cleanEmail = email.trim().toLowerCase();
                    const cleanPhone = phone.toString().trim();

                    // Validate name format
                    if (cleanName.length < 2) {
                        throw new Error('Name must be at least 2 characters long');
                    }

                    if (!/^[a-zA-Z\s'-\.]+$/.test(cleanName)) {
                        throw new Error('Name contains invalid characters');
                    }

                    // Validate email format
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(cleanEmail)) {
                        throw new Error('Invalid email format');
                    }

                    // Validate phone format
                    if (!/^[\+]?[\d\s\-\(\)]{7,20}$/.test(cleanPhone)) {
                        throw new Error('Invalid phone number format');
                    }
                    
                    // Check for duplicate email in database
                    const checkResult = await pool.request()
                        .input('email', sql.NVarChar, cleanEmail)
                        .query('SELECT Id, Name FROM Students WHERE Email = @email');
                    
                    if (checkResult.recordset.length > 0) {
                        results.duplicates++;
                        results.errors.push({
                            row: rowNumber,
                            name: cleanName,
                            email: cleanEmail,
                            error: `Email already exists (belongs to: ${checkResult.recordset[0].Name})`
                        });
                        continue;
                    }
                    
                    // Insert student WITHOUT resumeLink (only Name, Email, Phone)
                    const insertResult = await pool.request()
                        .input('name', sql.NVarChar, cleanName)
                        .input('email', sql.NVarChar, cleanEmail)
                        .input('phone', sql.NVarChar, cleanPhone)
                        .query(`
                            INSERT INTO Students (Name, Email, Phone, CreatedAt)
                            VALUES (@name, @email, @phone, GETDATE());
                            SELECT SCOPE_IDENTITY() as Id;
                        `);
                    
                    results.successful++;
                    results.processed.push({
                        row: rowNumber,
                        studentId: insertResult.recordset[0].Id,
                        name: cleanName,
                        email: cleanEmail,
                        phone: cleanPhone
                    });

                    console.log(`✅ Row ${rowNumber}: Added student ${cleanName} (${cleanEmail}) - ${cleanPhone}`);
                    
                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        row: rowNumber,
                        name: row['Full Name'] || row['Name'] || 'N/A',
                        email: row['Email Address'] || row['Email'] || 'N/A',
                        error: error.message
                    });
                    console.error(`❌ Row ${rowNumber} error:`, error.message);
                }
            }

            // Clean up uploaded file
            try {
                const fs = require('fs');
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log('🗑️ Cleaned up uploaded file:', filePath);
                }
            } catch (cleanupError) {
                console.warn('⚠️ Could not clean up file:', cleanupError.message);
            }

            console.log('📊 Excel processing completed:', {
                total: results.total,
                successful: results.successful,
                failed: results.failed,
                duplicates: results.duplicates
            });

            return results;
            
        } catch (error) {
            console.error('❌ Error processing Excel file:', error);
            
            // Clean up file on error
            try {
                const fs = require('fs');
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (cleanupError) {
                console.warn('⚠️ Could not clean up file after error:', cleanupError.message);
            }
            
            throw new Error('Failed to process Excel file: ' + error.message);
        }
    },

    // Validate Excel file structure before processing
    validateExcelStructure: (filePath) => {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (data.length === 0) {
                return { valid: false, error: 'File is empty' };
            }

            const headers = data[0];
            
            // Check for required columns (flexible naming)
            const hasName = headers.some(h => 
                ['Full Name', 'Name', 'Student Name'].includes(h)
            );
            const hasEmail = headers.some(h => 
                ['Email Address', 'Email', 'Student Email'].includes(h)
            );
            const hasPhone = headers.some(h => 
                ['Phone Number', 'Phone', 'Mobile Number', 'Contact Number'].includes(h)
            );

            if (!hasName) {
                return { 
                    valid: false, 
                    error: 'Missing required column: Full Name (or Name, Student Name)' 
                };
            }

            if (!hasEmail) {
                return { 
                    valid: false, 
                    error: 'Missing required column: Email Address (or Email, Student Email)' 
                };
            }

            if (!hasPhone) {
                return { 
                    valid: false, 
                    error: 'Missing required column: Phone Number (or Phone, Mobile Number, Contact Number)' 
                };
            }

            // Check if there are any resume-related columns (warn user)
            const resumeColumns = headers.filter(h => 
                h && (h.toLowerCase().includes('resume') || h.toLowerCase().includes('cv'))
            );

            if (resumeColumns.length > 0) {
                console.warn('⚠️ Resume columns found in Excel, will be ignored:', resumeColumns);
            }

            return { 
                valid: true, 
                rowCount: data.length - 1, // Exclude header
                headers: headers,
                resumeColumnsFound: resumeColumns
            };

        } catch (error) {
            return { 
                valid: false, 
                error: 'Invalid Excel file: ' + error.message 
            };
        }
    },

    // Helper method: Get supported column formats
    getSupportedColumns: () => {
        return {
            required: {
                name: ['Full Name', 'Name', 'Student Name'],
                email: ['Email Address', 'Email', 'Student Email'],
                phone: ['Phone Number', 'Phone', 'Mobile Number', 'Contact Number']
            },
            ignored: ['Resume Link', 'CV Link', 'Resume', 'CV'] // These will be ignored if present
        };
    }
};

module.exports = excelService;
