const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for this proxy
    crossOriginEmbedderPolicy: false
}));

// CORS configuration - Allow your Shiba Bot domain
const corsOptions = {
    origin: [
        'https://jxxmey.github.io',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        // Add your actual domain here
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept only image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: '🐕 OCR Proxy Server is running!',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: 'GET /',
            ocr: 'POST /api/ocr'
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Main OCR proxy endpoint
app.post('/api/ocr', upload.single('file'), async (req, res) => {
    try {
        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: '🐕 น้องชิบะไม่เจอไฟล์รูปภาพ! กรุณาอัพโหลดรูปใบเสร็จ'
            });
        }

        console.log(`📸 Processing OCR request - File: ${req.file.originalname}, Size: ${req.file.size} bytes`);

        // Create FormData for the external API
        const FormData = require('form-data');
        const formData = new FormData();
        
        // Add the file buffer to FormData
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        // Make request to the actual OCR API
        const ocrResponse = await axios.post(
            'https://ocr-slip.onrender.com/parse-slip-image',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Accept': 'application/json'
                },
                timeout: 30000, // 30 second timeout
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        console.log('✅ OCR API Response received successfully');

        // Return the OCR result
        res.json({
            success: true,
            data: ocrResponse.data,
            message: '🐕 น้องชิบะอ่านสลิปสำเร็จแล้ว!',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ OCR Proxy Error:', error.message);

        // Handle different types of errors
        if (error.code === 'ECONNABORTED') {
            return res.status(408).json({
                error: 'Request timeout',
                message: '🐕 น้องชิบะรอนานเกินไป! ลองใหม่อีกครั้งนะ',
                details: 'The OCR service took too long to respond'
            });
        }

        if (error.response) {
            // The OCR API returned an error
            return res.status(error.response.status).json({
                error: 'OCR API Error',
                message: '🐕 น้องชิบะอ่านสลิปไม่ได้! ลองใหม่อีกครั้งนะ',
                details: error.response.data || error.message,
                status: error.response.status
            });
        }

        if (error.request) {
            // Network error
            return res.status(503).json({
                error: 'Network Error',
                message: '🐕 น้องชิบะเชื่อมต่อไม่ได้! ตรวจสอบอินเทอร์เน็ตนะ',
                details: 'Unable to connect to OCR service'
            });
        }

        // Other errors
        res.status(500).json({
            error: 'Internal Server Error',
            message: '🐕 น้องชิบะเจอปัญหา! ลองใหม่อีกครั้งนะ',
            details: error.message
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large',
                message: '🐕 ไฟล์ใหญ่เกินไป! ขนาดไม่เกิน 10MB นะ'
            });
        }
    }

    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal Server Error',
        message: '🐕 น้องชิบะเจอปัญหาไม่คาดคิด!'
    });
});

// Handle 404
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: '🐕 น้องชิบะหาไม่เจอ! ลองเช็ค URL อีกครั้งนะ',
        availableEndpoints: {
            health: 'GET /',
            ocr: 'POST /api/ocr'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 OCR Proxy Server is running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/`);
    console.log(`🔗 OCR endpoint: http://localhost:${PORT}/api/ocr`);
    console.log(`🐕 Ready to help Shiba Bot read receipts!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    process.exit(0);
});