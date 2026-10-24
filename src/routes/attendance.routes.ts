import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import {
  requireAttendanceManage,
  requireAttendanceSelfOrManage
} from '../middlewares/attendance-auth';
import {
  checkIn,
  checkOut,
  getTodayAttendance,
  getDailyRoster,
  markAttendance,
  bulkMarkAttendance,
  getMonthlyMatrix,
  getStaffAttendanceSummary,
  exportMonthlyAttendance
} from '../controllers/attendance.controller';

const router = Router();

router.use(authenticate);

router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.post('/mark', requireAttendanceSelfOrManage('body'), markAttendance);
router.post('/bulk', requireAttendanceManage, bulkMarkAttendance);
router.get('/today', getTodayAttendance);
router.get('/daily', requireAttendanceManage, getDailyRoster);
router.get('/monthly', requireAttendanceManage, getMonthlyMatrix);
router.get('/export', requireAttendanceManage, exportMonthlyAttendance);
router.get(
  '/summary/:userId',
  requireAttendanceSelfOrManage('params'),
  getStaffAttendanceSummary
);

export default router;
