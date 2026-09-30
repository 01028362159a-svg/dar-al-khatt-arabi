import express from 'express';
import multer from 'multer';
import cookieSession from 'cookie-session';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Khaled 27';

const DATA = path.join(__dirname, 'data');
const VIDEOS = path.join(DATA, 'videos');
const DB = path.join(DATA, 'courses.json');

fs.mkdirSync(VIDEOS, { recursive: true });

const defaults = [
  {
    id: 'c0',
    t: 'خط النسخ',
    g: 'ن',
    price: '٣٥٠ جنيه',
    desc: 'أساسيات النسخ من إمساك القلم إلى الحروف المتصلة.',
    ls: []
  },
  {
    id: 'c1',
    t: 'خط الرقعة',
    g: 'ر',
    price: '٣٠٠ جنيه',
    desc: 'مدخل عملي للرقعة والسرعة والانسياب.',
    ls: []
  },
  {
    id: 'c2',
    t: 'الخط الفارسي (التعليق)',
    g: 'ع',
    price: '٤٠٠ جنيه',
    desc: 'جمال الخط الفارسي وميل الحروف وتمارين المد.',
    ls: []
  }
];

function read() {
  try {
    return JSON.parse(fs.readFileSync(DB, 'utf8'));
  } catch {
    fs.writeFileSync(DB, JSON.stringify(defaults, null, 2));
    return structuredClone(defaults);
  }
}

function write(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

read();

app.use(express.json());

app.use(
  cookieSession({
    name: 'teacher',
    keys: [process.env.SESSION_KEY || 'dar-al-khatt-session-key'],
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 43200000
  })
);

/* الملفات موجودة في جذر المشروع */
app.use(express.static(__dirname));

function auth(req, res, next) {
  if (req.session?.teacher) return next();
  return res.status(401).json({ error: 'غير مصرح' });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, VIDEOS),
    filename: (req, file, cb) => {
      cb(
        null,
        crypto.randomUUID() +
          path.extname(file.originalname).toLowerCase()
      );
    }
  }),
  limits: {
    fileSize: 1024 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype.startsWith('video/'));
  }
});

/* تسجيل دخول المدرس */
app.post('/api/login', (req, res) => {
  if (req.body?.password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      error: 'كلمة المرور غير صحيحة'
    });
  }

  req.session.teacher = true;
  res.json({ ok: true });
});

/* تسجيل الخروج */
app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

/* حالة تسجيل الدخول */
app.get('/api/me', (req, res) => {
  res.json({
    teacher: !!req.session?.teacher
  });
});

/* الكورسات */
app.get('/api/courses', (req, res) => {
  res.json(read());
});

/* إضافة كورس */
app.post('/api/courses', auth, (req, res) => {
  const data = read();

  if (!req.body?.title?.trim()) {
    return res.status(400).json({
      error: 'اسم الكورس مطلوب'
    });
  }

  const title = req.body.title.trim();

  const course = {
    id: 'c' + crypto.randomUUID(),
    t: title,
    g: title[0],
    price: (req.body.price || 'يحدد لاحقًا').trim(),
    desc: (req.body.desc || '').trim(),
    ls: []
  };

  data.push(course);
  write(data);

  res.json(course);
});

/* حذف كورس */
app.delete('/api/courses/:id', auth, (req, res) => {
  const data = read();
  const course = data.find(x => x.id === req.params.id);

  if (!course) return res.sendStatus(404);

  for (const lesson of course.ls || []) {
    if (lesson.video) {
      try {
        fs.unlinkSync(path.join(VIDEOS, lesson.video));
      } catch {}
    }
  }

  write(data.filter(x => x.id !== req.params.id));

  res.json({ ok: true });
});

/* رفع فيديو */
app.post(
  '/api/courses/:id/lessons',
  auth,
  upload.single('video'),
  (req, res) => {
    const data = read();
    const course = data.find(x => x.id === req.params.id);

    if (!course) return res.sendStatus(404);

    if (!req.file) {
      return res.status(400).json({
        error: 'الفيديو مطلوب'
      });
    }

    let chapters = [];

    try {
      chapters = JSON.parse(req.body.chapters || '[]');
    } catch {}

    const lesson = {
      id: 'l' + crypto.randomUUID(),
      t: (req.body.title || 'حصة جديدة').trim(),
      d:
        Math.max(
          1,
          Math.round(req.file.size / 1048576)
        ) + ' MB',
      ch: chapters,
      video: req.file.filename
    };

    course.ls.push(lesson);
    write(data);

    res.json(lesson);
  }
);

/* تشغيل الفيديو */
app.get('/api/videos/:file', (req, res) => {
  const file = path.basename(req.params.file);
  const filePath = path.join(VIDEOS, file);

  if (!fs.existsSync(filePath)) {
    return res.sendStatus(404);
  }

  res.sendFile(filePath);
});

/* تشغيل الموقع */
app.listen(PORT, () => {
  console.log('Dar Al Khatt
