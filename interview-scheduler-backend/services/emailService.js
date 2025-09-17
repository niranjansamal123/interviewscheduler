// const nodemailer = require('nodemailer');
// const fs = require('fs').promises;
// const path = require('path');
// const crypto = require('crypto');
// const { getPool, sql } = require('../config/database');

// // Configure transporter
// const transporter = nodemailer.createTransport({
//     service: 'gmail', // Or your SMTP provider
//     auth: {
//         user: process.env.EMAIL_USER || 'your-email@gmail.com',
//         pass: process.env.EMAIL_PASSWORD || 'your-app-password'
//     }
// });

// const emailService = {
//     // ➤ Send Interview Invitation
//     sendInvitationEmail: async (student) => {
//         try {
//             const token = crypto.randomBytes(32).toString('hex');
//             const invitationLink = `${process.env.FRONTEND_URL}/student/select-slot?token=${token}`;

//             const pool = await getPool();
//             await pool.request()
//                 .input('studentId', sql.Int, student.Id)
//                 .input('token', sql.NVarChar, token)
//                 .query(`
//                     INSERT INTO Interviews (StudentId, SlotId, InvitationToken, Status, CreatedAt)
//                     VALUES (@studentId, NULL, @token, 'Invited', GETDATE())
//                 `);

//             // Load email template
//             const templatePath = path.join(__dirname, '../templates/invitation.html');
//             let htmlTemplate = await fs.readFile(templatePath, 'utf8');

//             // Replace placeholders
//             htmlTemplate = htmlTemplate
//                 .replace('{{studentName}}', student.Name)
//                 .replace('{{invitationLink}}', invitationLink);

//             const mailOptions = {
//                 from: process.env.EMAIL_USER,
//                 to: student.Email,
//                 subject: 'Interview Invitation - Schedule Your Slot',
//                 html: htmlTemplate
//             };

//             await transporter.sendMail(mailOptions);
//             console.log(`Invitation sent to ${student.Email}`);
//         } catch (error) {
//             console.error('Error sending invitation:', error);
//             throw error;
//         }
//     },

//     // ➤ Send Interview Confirmation
//     sendConfirmationEmail: async (student, slot, interviewer, meetingLink) => {
//         try {
//             const templatePath = path.join(__dirname, '../templates/confirmation.html');
//             let htmlTemplate = await fs.readFile(templatePath, 'utf8');

//             const slotDate = new Date(slot.SlotDateTime).toLocaleString();

//             htmlTemplate = htmlTemplate
//                 .replace('{{studentName}}', student.Name)
//                 .replace('{{slotDateTime}}', slotDate)
//                 .replace('{{interviewer}}', interviewer)
//                 .replace('{{meetingLink}}', meetingLink);

//             // Send to student
//             await transporter.sendMail({
//                 from: process.env.EMAIL_USER,
//                 to: student.Email,
//                 subject: 'Interview Confirmed - Details Inside',
//                 html: htmlTemplate
//             });

//             // Optionally notify interviewer
//             if (process.env.INTERVIEWER_EMAIL) {
//                 await transporter.sendMail({
//                     from: process.env.EMAIL_USER,
//                     to: process.env.INTERVIEWER_EMAIL,
//                     subject: `Interview Scheduled with ${student.Name}`,
//                     html: htmlTemplate
//                 });
//             }

//             console.log(`Confirmation sent to ${student.Email}`);
//         } catch (error) {
//             console.error('Error sending confirmation:', error);
//             throw error;
//         }
//     }
// };

// module.exports = emailService;


const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { getPool, sql } = require('../config/database');

// B2World SMTP configurations only
const getTransporterConfigs = () => {
    console.log('🔧 Creating B2World transporter configurations...');
    console.log('📧 EMAIL_USER:', process.env.EMAIL_USER);
    console.log('📧 EMAIL_HOST:', process.env.EMAIL_HOST);
    console.log('📧 EMAIL_PORT:', process.env.EMAIL_PORT);
    console.log('📧 EMAIL_PASSWORD exists:', !!process.env.EMAIL_PASSWORD);

    const configs = [];

    if (process.env.EMAIL_PASSWORD && process.env.EMAIL_USER) {
        // B2World STARTTLS (Primary)
        configs.push({
            name: 'B2World STARTTLS',
            host: process.env.EMAIL_HOST || 'mail.b2world.in',
            port: parseInt(process.env.EMAIL_PORT) || 587,
            secure: process.env.EMAIL_SECURE === 'true', // false for port 587
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            },
            tls: { 
                rejectUnauthorized: false
            }
        });
        console.log('✅ B2World STARTTLS configuration added');

        // B2World SSL (Fallback)
        configs.push({
            name: 'B2World SSL',
            host: process.env.EMAIL_HOST || 'mail.b2world.in',
            port: 465,
            secure: true, // true for port 465
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            },
            tls: { 
                rejectUnauthorized: false 
            }
        });
        console.log('✅ B2World SSL configuration added');
    } else {
        console.log('❌ B2World configurations skipped - missing EMAIL_PASSWORD or EMAIL_USER');
    }

    console.log(`📊 Total configurations created: ${configs.length}`);
    return configs;
};

// Create transporter with proper method name
const createTransporter = async () => {
    const configs = getTransporterConfigs();
    
    if (configs.length === 0) {
        console.error('❌ No valid email configurations found!');
        console.error('📋 Required environment variables:');
        console.error('   - EMAIL_USER (found:', !!process.env.EMAIL_USER, ')');
        console.error('   - EMAIL_PASSWORD (found:', !!process.env.EMAIL_PASSWORD, ')');
        throw new Error('No email configurations available. Check your environment variables.');
    }
    
    for (let i = 0; i < configs.length; i++) {
        const config = configs[i];
        console.log(`🔄 Attempting connection ${i + 1}/${configs.length}: ${config.name}`);
        
        try {
            // FIXED: Use createTransport (not createTransporter)
            const transporter = nodemailer.createTransport(config);
            
            console.log(`📡 Testing connection for ${config.name}...`);
            
            // Test the connection
            await transporter.verify();
            
            console.log(`✅ Successfully connected using: ${config.name}`);
            return { transporter, configName: config.name };
            
        } catch (error) {
            console.error(`❌ ${config.name} failed:`, error.message);
            console.error(`   Code: ${error.code || 'N/A'}`);
            console.error(`   Response: ${error.response || 'N/A'}`);
            
            // Continue to next configuration
            continue;
        }
    }
    
    console.error('❌ All email server configurations failed!');
    console.error('📋 Tried configurations:', configs.map(c => c.name).join(', '));
    throw new Error('All email server configurations failed');
};

const emailService = {
    // Test email connection
    testConnection: async () => {
        try {
            console.log('🧪 Testing B2World email connection...');
            const { transporter, configName } = await createTransporter();
            console.log(`✅ Email connection test successful using: ${configName}`);
            return { success: true, provider: configName };
        } catch (error) {
            console.error('❌ Email connection test failed:', error.message);
            return { success: false, error: error.message };
        }
    },

    // Send Interview Invitation (Single)
    sendInvitationEmail: async (student) => {
        try {
            const token = crypto.randomBytes(32).toString('hex');
            const invitationLink = `${process.env.FRONTEND_URL}/student/select-slot?token=${token}`;

            const pool = await getPool();
            await pool.request()
                .input('studentId', sql.Int, student.Id)
                .input('token', sql.NVarChar, token)
                .query(`
                    INSERT INTO Interviews (StudentId, SlotId, InvitationToken, Status, CreatedAt)
                    VALUES (@studentId, NULL, @token, 'Invited', GETDATE())
                `);

            // Load email template
            const templatePath = path.join(__dirname, '../templates/invitation.html');
            let htmlTemplate = await fs.readFile(templatePath, 'utf8');

            // Replace placeholders
            htmlTemplate = htmlTemplate
                .replace(/{{studentName}}/g, student.Name)
                .replace(/{{invitationLink}}/g, invitationLink);

            const { transporter, configName } = await createTransporter();

            const mailOptions = {
                from: {
                    name: 'B2World HR Team - Manish Anand',
                    address: process.env.EMAIL_USER
                },
                to: student.Email,
                subject: 'Interview Invitation - B2World (BTOW Pvt. Ltd.)',
                html: htmlTemplate,
                headers: {
                    'X-Mailer': 'B2World Interview Scheduler',
                    'X-Priority': '3',
                    'Reply-To': process.env.EMAIL_USER
                },
                text: `
Hello ${student.Name},

We are pleased to invite you for an interview with our team at B2World (BTOW Pvt. Ltd.).

Please click the link below to select your preferred interview time slot:
${invitationLink}

Important Notes:
- Please select your slot within 48 hours
- The interview will be conducted via video call
- You will receive confirmation details after slot selection

For any questions, contact:
Manish Anand
HR Team - B2World (BTOW Pvt. Ltd.)
Email: hr@b2world.in
Mobile: +91 7482909107

Best regards,
B2World HR Team
                `.trim()
            };

            const result = await transporter.sendMail(mailOptions);
            
            return {
                success: true,
                token: token,
                invitationLink: invitationLink,
                messageId: result.messageId,
                provider: configName
            };
        } catch (error) {
            throw error;
        }
    },

    // Send Bulk Invitations with Sequential Processing
    sendBulkInvitations: async (students) => {
        const results = [];
        const errors = [];
        let transporter = null;
        let configName = '';

        console.log(`📧 Starting bulk invitation process for ${students.length} students`);

        try {
            // Create transporter once for all emails
            const transporterInfo = await createTransporter();
            transporter = transporterInfo.transporter;
            configName = transporterInfo.configName;
            console.log(`✅ Using email provider: ${configName}`);
        } catch (error) {
            console.error('❌ Failed to create email transporter:', error.message);
            throw new Error('Failed to initialize email service: ' + error.message);
        }

        // Load email template once
        let htmlTemplate;
        try {
            const templatePath = path.join(__dirname, '../templates/invitation.html');
            htmlTemplate = await fs.readFile(templatePath, 'utf8');
            console.log('✅ Email template loaded successfully');
        } catch (error) {
            console.error('❌ Failed to load email template:', error);
            throw new Error('Failed to load email template');
        }

        // Process each student sequentially
        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            
            try {
                console.log(`📤 Processing invitation ${i + 1}/${students.length} for: ${student.Name} (${student.Email})`);
                
                // Generate token and invitation link
                const token = crypto.randomBytes(32).toString('hex');
                const invitationLink = `${process.env.FRONTEND_URL}/student/select-slot?token=${token}`;

                // Insert interview record
                const pool = await getPool();
                await pool.request()
                    .input('studentId', sql.Int, student.Id)
                    .input('token', sql.NVarChar, token)
                    .query(`
                        INSERT INTO Interviews (StudentId, SlotId, InvitationToken, Status, CreatedAt)
                        VALUES (@studentId, NULL, @token, 'Invited', GETDATE())
                    `);

                // Prepare email content
                const personalizedTemplate = htmlTemplate
                    .replace(/{{studentName}}/g, student.Name)
                    .replace(/{{invitationLink}}/g, invitationLink);

                const mailOptions = {
                    from: {
                        name: 'B2World HR Team - Manish Anand',
                        address: process.env.EMAIL_USER
                    },
                    to: student.Email,
                    subject: 'Interview Invitation - B2World (BTOW Pvt. Ltd.)',
                    html: personalizedTemplate,
                    headers: {
                        'X-Mailer': 'B2World Interview Scheduler',
                        'X-Priority': '3',
                        'Reply-To': process.env.EMAIL_USER
                    },
                    text: `
Hello ${student.Name},

We are pleased to invite you for an interview with our team at B2World (BTOW Pvt. Ltd.).

Please click the link below to select your preferred interview time slot:
${invitationLink}

Important Notes:
- Please select your slot within 48 hours
- The interview will be conducted via video call
- You will receive confirmation details after slot selection

For any questions, contact:
Manish Anand
HR Team - B2World (BTOW Pvt. Ltd.)
Email: hr@b2world.in
Mobile: +91 7482909107

Best regards,
B2World HR Team
                    `.trim()
                };

                // Send email
                const emailResult = await transporter.sendMail(mailOptions);
                
                results.push({
                    studentId: student.Id,
                    studentName: student.Name,
                    studentEmail: student.Email,
                    success: true,
                    messageId: emailResult.messageId,
                    token: token,
                    invitationLink: invitationLink,
                    provider: configName
                });

                console.log(`✅ Invitation sent successfully to: ${student.Name} (${i + 1}/${students.length})`);
                
                // Add delay between emails to prevent rate limiting (except for last email)
                if (i < students.length - 1) {
                    console.log(`⏳ Waiting 2 seconds before next email...`);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
                }
                
            } catch (error) {
                console.error(`❌ Failed to send invitation to ${student.Name} (${student.Email}):`, error.message);
                
                errors.push({
                    studentId: student.Id,
                    studentName: student.Name,
                    studentEmail: student.Email,
                    success: false,
                    error: error.message
                });
            }
        }

        const summary = {
            success: errors.length === 0,
            totalAttempted: students.length,
            successCount: results.length,
            errorCount: errors.length,
            results: results,
            errors: errors,
            provider: configName
        };

        console.log(`📊 Bulk invitation summary: ${results.length} sent, ${errors.length} failed using ${configName}`);
        
        return summary;
    },

    // Send Interview Confirmation
    sendConfirmationEmail: async (student, slot, interviewer, meetingLink) => {
        try {
            const templatePath = path.join(__dirname, '../templates/confirmation.html');
            let htmlTemplate = await fs.readFile(templatePath, 'utf8');

            const slotDate = new Date(slot.SlotDateTime).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // Replace placeholders
            htmlTemplate = htmlTemplate
                .replace(/{{studentName}}/g, student.Name)
                .replace(/{{slotDateTime}}/g, slotDate)
                .replace(/{{interviewer}}/g, interviewer)
                .replace(/{{meetingLink}}/g, meetingLink);

            const { transporter, configName } = await createTransporter();

            // Text version for confirmation
            const textVersion = `
Hello ${student.Name},

Your interview slot has been confirmed!

Interview Details:
- Date & Time: ${slotDate}
- Interviewer: ${interviewer}
- Duration: 45 minutes (approximately)
- Format: Video Call

Meeting Link: ${meetingLink}

Important Notes:
- Join the meeting 5 minutes before the scheduled time
- Ensure stable internet connection
- Test your camera and microphone beforehand
- Have your resume and documents ready

For any queries, contact:
Manish Anand - HR Team
Email: hr@b2world.in
Mobile: +91 7482909107

Best regards,
B2World (BTOW Pvt. Ltd.)
            `.trim();

            // Send to student
            const result = await transporter.sendMail({
                from: {
                    name: 'B2World HR Team - Manish Anand',
                    address: process.env.EMAIL_USER
                },
                to: student.Email,
                subject: 'Interview Confirmed - B2World (BTOW Pvt. Ltd.)',
                html: htmlTemplate,
                text: textVersion,
                headers: {
                    'X-Priority': '3',
                    'Reply-To': process.env.EMAIL_USER
                }
            });

            console.log(`✅ Confirmation sent to student: ${student.Email}`);

            // HR notification emails
            const hrEmails = [];
            
            if (process.env.HR_NOTIFICATION_EMAIL) {
                hrEmails.push(process.env.HR_NOTIFICATION_EMAIL);
            }
            
            if (process.env.INTERVIEWER_EMAIL && 
                process.env.INTERVIEWER_EMAIL !== process.env.HR_NOTIFICATION_EMAIL) {
                hrEmails.push(process.env.INTERVIEWER_EMAIL);
            }
            
            const uniqueHrEmails = [...new Set(hrEmails)].filter(email => 
                email && email !== student.Email
            );

            console.log('📧 HR Emails to notify:', uniqueHrEmails);

            // Send HR notifications
            for (const hrEmail of uniqueHrEmails) {
                try {
                    await transporter.sendMail({
                        from: {
                            name: 'B2World Interview System',
                            address: process.env.EMAIL_USER
                        },
                        to: hrEmail,
                        subject: `Interview Scheduled - ${student.Name} | ${slotDate}`,
                        html: `
                            <h2>New Interview Scheduled</h2>
                            <p><strong>Student:</strong> ${student.Name}</p>
                            <p><strong>Email:</strong> ${student.Email}</p>
                            <p><strong>Date & Time:</strong> ${slotDate}</p>
                            <p><strong>Interviewer:</strong> ${interviewer}</p>
                            <p><strong>Meeting Link:</strong> <a href="${meetingLink}">Join Meeting</a></p>
                            <p>Please prepare for the interview and test the meeting link.</p>
                        `,
                        headers: {
                            'X-Priority': '2',
                            'Importance': 'high',
                            'Reply-To': process.env.EMAIL_USER
                        }
                    });

                    console.log(`✅ HR notification sent to: ${hrEmail}`);
                } catch (hrError) {
                    console.error(`❌ Failed to send HR notification to ${hrEmail}:`, hrError.message);
                }
            }

            return { 
                success: true, 
                messageId: result.messageId,
                provider: configName,
                hrNotified: uniqueHrEmails.length > 0,
                hrEmailsSent: uniqueHrEmails.length
            };
        } catch (error) {
            console.error('❌ Error in sendConfirmationEmail:', error);
            throw error;
        }
    }
};

module.exports = emailService;

