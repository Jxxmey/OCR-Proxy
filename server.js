require('dotenv').config();

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const ALLOWED_ORIGINS_RAW = process.env.ALLOWED_ORIGINS || '';
const OCR_API_URL = process.env.OCR_API_URL || process.env.FASTAPI_OCR_URL || 'https://ocr-slip.onrender.com/parse-slip-image';
const OCR_TIMEOUT = parseInt(process.env.OCR_TIMEOUT, 10) || 30000;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024;

// Parse ALLOWED_ORIGINS string to array or allow all if empty or '*'
let allowedOrigins = [];
if (ALLOWED_ORIGINS_RAW.trim() === '' || ALLOWED_ORIGINS_RAW.trim() === '*') {
    allowedOrigins = '*'; // allow all origins
} else {
    allowedOrigins = ALLOWED_ORIGINS_RAW.split(',').map(origin => origin.trim());
}

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

// CORS setup
if (allowedOrigins === '*') {
    app.use(cors({
        origin: true,  // allow all origins
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
        credentials: true,
    }));
} else {
    app.use(cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true); // allow REST tools like Postman with no origin
            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error(`CORS policy: Origin ${origin} not allowed`));
            }
        },
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
        credentials: true,
    }));
}

app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: '🐕 OCR Proxy Server is running!',
        timestamp: new Date().toISOString(),
        config: {
            allowedOrigins,
            ocrApiUrl: OCR_API_URL,
            maxFileSize: MAX_FILE_SIZE,
        },
        endpoints: {
            health: 'GET /',
            ocr: 'POST /api/ocr'
        }
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

app.post('/api/ocr', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: '🐕 น้องชิบะไม่เจอไฟล์รูปภาพ! กรุณาอัพโหลดรูปใบเสร็จ'
            });
        }

        console.log(`📸 Received file: ${req.file.originalname}, size: ${req.file.size} bytes`);

        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });

        const response = await axios.post(OCR_API_URL, formData, {
            headers: {
                ...formData.getHeaders(),
                Accept: 'application/json',
            },
            timeout: OCR_TIMEOUT,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        console.log('✅ OCR API response received.');

        return res.json({
            success: true,
            data: response.data,
            message: '🐕 น้องชิบะอ่านสลิปสำเร็จแล้ว!',
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        console.error('❌ OCR Proxy Error:', error.message);

        if (error.code === 'ECONNABORTED') {
            return res.status(408).json({
                error: 'Request timeout',
                message: '🐕 น้องชิบะรอนานเกินไป! ลองใหม่อีกครั้งนะ',
                details: 'OCR service took too long to respond',
            });
        }

        if (error.response) {
            return res.status(error.response.status).json({
                error: 'OCR API Error',
                message: '🐕 น้องชิบะอ่านสลิปไม่ได้! ลองใหม่อีกครั้งนะ',
                details: error.response.data || error.message,
                status: error.response.status,
            });
        }

        if (error.request) {
            return res.status(503).json({
                error: 'Network Error',
                message: '🐕 น้องชิบะเชื่อมต่อไม่ได้! ตรวจสอบอินเทอร์เน็ตนะ',
                details: 'Unable to connect to OCR service',
            });
        }

        return res.status(500).json({
            error: 'Internal Server Error',
            message: '🐕 น้องชิบะเจอปัญหา! ลองใหม่อีกครั้งนะ',
            details: error.message,
        });
    }
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large',
                message: '🐕 ไฟล์ใหญ่เกินไป! ขนาดไม่เกิน 10MB นะ',
            });
        }
    }

    if (err.message && err.message.startsWith('CORS policy')) {
        return res.status(403).json({
            error: 'CORS Error',
            message: err.message,
        });
    }

    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: '🐕 น้องชิบะเจอปัญหาไม่คาดคิด!',
    });
});

app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: '🐕 น้องชิบะหาไม่เจอ! ลองเช็ค URL อีกครั้งนะ',
        availableEndpoints: {
            health: 'GET /',
            ocr: 'POST /api/ocr',
        },
    });
});

app.listen(PORT, () => {
    console.log(`🚀 OCR Proxy Server running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/`);
    console.log(`🔗 OCR endpoint: http://localhost:${PORT}/api/ocr`);
});

process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    process.exit(0);
});
