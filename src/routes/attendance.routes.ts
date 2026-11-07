import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import {
  requireAttendanceViewAll,
  requireAttendanceMatrixView,
  requireAttendanceExport,
  requireAttendanceManualEntry,
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

// Personal Web Punch
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/today', getTodayAttendance);

// Manual Adjustment & Management
router.post('/mark', requireAttendanceManualEntry, markAttendance);
router.post('/bulk', requireAttendanceManage, bulkMarkAttendance);

// Firm Daily Operations Desk (Roster)
router.get('/daily', requireAttendanceViewAll, getDailyRoster);

// 31-Day Firm Attendance Matrix
router.get('/monthly', requireAttendanceMatrixView, getMonthlyMatrix);

// Payroll / Attendance CSV Export
router.get('/export', requireAttendanceExport, exportMonthlyAttendance);

// Individual Staff Attendance Summary (Self or Manager)
router.get(
  '/summary/:userId',
  requireAttendanceSelfOrManage('params'),
  getStaffAttendanceSummary
);

export default router;
