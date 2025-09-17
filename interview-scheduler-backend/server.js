const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Import routes
const studentRoutes = require('./routes/students');
const slotRoutes = require('./routes/slots');
const interviewRoutes = require('./routes/interviews');

const app = express();
const PORT = process.env.PORT || 3001;

// Enhanced CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'https://interviewscheduler.marindrive.in',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
}

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Enhanced multer configuration for multiple file types
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, fileExtension);
        
        // Clean filename and add prefix based on field name
        const cleanBaseName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
        const finalName = `${file.fieldname}-${cleanBaseName}-${uniqueSuffix}${fileExtension}`;
        
        cb(null, finalName);
    }
});

// Enhanced file filter for both Excel and resume files
const fileFilter = (req, file, cb) => {
    const allowedTypes = {
        // Excel files (for bulk upload)
        excel: [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ],
        // Resume files (PDF, DOC, DOCX)
        resume: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ]
    };

    // Get all allowed types
    const allAllowedTypes = [
        ...allowedTypes.excel,
        ...allowedTypes.resume
    ];

    if (allAllowedTypes.includes(file.mimetype)) {
        // Additional validation based on field name
        if (file.fieldname === 'excel' && !allowedTypes.excel.includes(file.mimetype)) {
            return cb(new Error('Invalid Excel file type. Only .xlsx and .xls files are allowed.'), false);
        }
        
        if (file.fieldname === 'resume' && !allowedTypes.resume.includes(file.mimetype)) {
            return cb(new Error('Invalid resume file type. Only PDF, DOC, and DOCX files are allowed.'), false);
        }

        cb(null, true);
    } else {
        const errorMsg = file.fieldname === 'excel' 
            ? 'Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'
            : 'Invalid file type. Only PDF, DOC, and DOCX files are allowed for resumes.';
        cb(new Error(errorMsg), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1 // Single file upload
    }
});

// Make upload middleware available globally
app.set('upload', upload);

// ---------------- API Routes ----------------
app.use('/api/students', studentRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/interviews', interviewRoutes);

// ---------------- Serve Frontend Build ----------------
app.use(express.static(path.join(__dirname, 'build')));

// SPA Fallback
app.get('*', (req, res) => {
    if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/uploads')) {
        return res.status(404).json({ error: 'Route not found' });
    }
    
    const indexPath = path.join(__dirname, 'build', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).json({ error: 'Frontend build not found' });
    }
});

// ---------------- Error Handling ----------------
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        console.error('📎 Multer Error:', error.message);
        
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                error: 'File too large. Maximum size allowed is 5MB.' 
            });
        }
        
        return res.status(400).json({ error: error.message });
    }
    
    console.error('❌ Server Error:', error);
    res.status(500).json({ 
        error: error.message || 'Internal server error'
    });
});

// ---------------- Health Check ----------------
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// ---------------- Server Startup ----------------
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Uploads directory: ${uploadsDir}`);
    console.log(`🌐 CORS origin: ${corsOptions.origin}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
