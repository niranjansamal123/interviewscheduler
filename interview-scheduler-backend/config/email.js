 
const nodemailer = require('nodemailer');

const emailConfig = {
    service: process.env.EMAIL_SERVICE || 'gmail',
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASSWORD || 'your-app-password'
    }
};

const createTransporter = () => {
    return nodemailer.createTransporter(emailConfig);
};

const testConnection = async () => {
    try {
        const transporter = createTransporter();
        await transporter.verify();
        console.log('Email service is ready');
        return true;
    } catch (error) {
        console.error('Email service error:', error);
        return false;
    }
};

module.exports = {
    emailConfig,
    createTransporter,
    testConnection
};
