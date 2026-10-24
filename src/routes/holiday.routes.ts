import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import {
  createHoliday,
  getHolidays,
  getHolidayById,
  updateHoliday,
  deleteHoliday,
  seedDefaultHolidays
} from '../controllers/holiday.controller';

const router = Router();

router.use(authenticate);

router.post('/seed-default', seedDefaultHolidays);
router.post('/', createHoliday);
router.get('/', getHolidays);
router.get('/:id', getHolidayById);
router.put('/:id', updateHoliday);
router.delete('/:id', deleteHoliday);

export default router;
