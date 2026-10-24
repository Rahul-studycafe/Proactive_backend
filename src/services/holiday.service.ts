import mongoose from 'mongoose';
import { Holiday, IHoliday } from '../models/Holiday';
import { ApiError } from '../common/errors/api-error';

export interface CreateHolidayInput {
  name: string;
  date: string;
  type?: 'National' | 'Festival' | 'Optional' | 'Other';
  description?: string;
}

export interface GetHolidaysQuery {
  year?: string | number;
  type?: string;
  from?: string;
  to?: string;
}

export const createHolidayService = async (
  tenantId: mongoose.Types.ObjectId,
  data: CreateHolidayInput
): Promise<IHoliday> => {
  // Check for collision on the same date for this tenant
  const existing = await Holiday.findOne({ tenantId, date: data.date });
  if (existing) {
    throw new ApiError(
      400,
      `A holiday ("${existing.name}") is already registered on ${data.date}`,
      'HOLIDAY_DATE_COLLISION'
    );
  }

  const holiday = await Holiday.create({
    tenantId,
    name: data.name.trim(),
    date: data.date,
    type: data.type || 'National',
    description: data.description?.trim()
  });

  return holiday;
};

export const getHolidaysService = async (
  tenantId: mongoose.Types.ObjectId,
  query: GetHolidaysQuery = {}
): Promise<IHoliday[]> => {
  const filter: any = { tenantId };

  if (query.year) {
    const yearStr = String(query.year);
    filter.date = { $regex: new RegExp(`^${yearStr}-`) };
  }

  if (query.type) {
    filter.type = query.type;
  }

  if (query.from || query.to) {
    filter.date = filter.date || {};
    if (query.from) filter.date.$gte = query.from;
    if (query.to) filter.date.$lte = query.to;
  }

  const holidays = await Holiday.find(filter).sort({ date: 1 });
  return holidays;
};

export interface UpdateHolidayInput {
  name?: string;
  date?: string;
  type?: 'National' | 'Festival' | 'Optional' | 'Other';
  description?: string;
}

export const getHolidayByIdService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string
): Promise<IHoliday> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid holiday ID', 'INVALID_ID');
  }

  const holiday = await Holiday.findOne({ _id: id, tenantId });
  if (!holiday) {
    throw new ApiError(404, 'Holiday not found', 'HOLIDAY_NOT_FOUND');
  }

  return holiday;
};

export const updateHolidayService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string,
  data: UpdateHolidayInput
): Promise<IHoliday> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid holiday ID', 'INVALID_ID');
  }

  const holiday = await Holiday.findOne({ _id: id, tenantId });
  if (!holiday) {
    throw new ApiError(404, 'Holiday not found', 'HOLIDAY_NOT_FOUND');
  }

  // If date is being changed, verify no collision with another holiday
  if (data.date && data.date !== holiday.date) {
    const collision = await Holiday.findOne({
      tenantId,
      date: data.date,
      _id: { $ne: holiday._id }
    });

    if (collision) {
      throw new ApiError(
        400,
        `A holiday ("${collision.name}") is already registered on ${data.date}`,
        'HOLIDAY_DATE_COLLISION'
      );
    }
    holiday.date = data.date;
  }

  if (data.name !== undefined) {
    holiday.name = data.name.trim();
    holiday.eventName = data.name.trim();
  }

  if (data.type !== undefined) {
    holiday.type = data.type;
  }

  if (data.description !== undefined) {
    holiday.description = data.description.trim();
  }

  await holiday.save();
  return holiday;
};

export const deleteHolidayService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string
): Promise<void> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid holiday ID', 'INVALID_ID');
  }

  const result = await Holiday.findOneAndDelete({ _id: id, tenantId });
  if (!result) {
    throw new ApiError(404, 'Holiday not found', 'HOLIDAY_NOT_FOUND');
  }
};

/**
 * Pre-populates standard statutory national holidays for a given calendar year
 */
export const seedDefaultHolidaysService = async (
  tenantId: mongoose.Types.ObjectId,
  yearParam?: string | number
): Promise<{ seededCount: number; year: number }> => {
  const year = yearParam ? parseInt(String(yearParam), 10) : new Date().getFullYear();
  if (isNaN(year) || year < 1970 || year > 2100) {
    throw new ApiError(400, 'Invalid calendar year provided', 'INVALID_YEAR');
  }

  const statutoryList = [
    { name: 'Republic Day', date: `${year}-01-26`, type: 'National' as const, description: 'National Holiday' },
    { name: 'May Day', date: `${year}-05-01`, type: 'Other' as const, description: 'International Workers Day' },
    { name: 'Independence Day', date: `${year}-08-15`, type: 'National' as const, description: 'National Holiday' },
    { name: 'Mahatma Gandhi Jayanti', date: `${year}-10-02`, type: 'National' as const, description: 'National Holiday' },
    { name: 'Christmas', date: `${year}-12-25`, type: 'Festival' as const, description: 'Festival Holiday' }
  ];

  const ops = statutoryList.map((h) => ({
    updateOne: {
      filter: { tenantId, date: h.date },
      update: {
        $set: {
          name: h.name,
          eventName: h.name,
          type: h.type,
          description: h.description
        },
        $setOnInsert: { tenantId, date: h.date }
      },
      upsert: true
    }
  }));

  const res = await Holiday.bulkWrite(ops);
  const seededCount = (res.upsertedCount || 0) + (res.modifiedCount || 0) + (res.matchedCount || 0);

  return { seededCount, year };
};
