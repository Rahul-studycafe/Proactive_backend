const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export type RecurrenceFrequency = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'one_time';
export type PeriodOffset = 'previous' | 'current';

/**
 * Calculates the standardized period label (e.g. "Jan 2026", "Q1 (Apr-Jun) 2026", "FY 2025-26")
 */
export const calculatePeriodString = (
  frequency: string,
  referenceDate: Date = new Date(),
  offset: PeriodOffset = 'previous'
): string => {
  const normFreq = frequency.toLowerCase();
  const year = referenceDate.getUTCFullYear();
  const monthIdx = referenceDate.getUTCMonth(); // 0 to 11

  if (normFreq === 'monthly') {
    if (offset === 'previous') {
      const prevDate = new Date(Date.UTC(year, monthIdx - 1, 1));
      return `${MONTH_NAMES[prevDate.getUTCMonth()]} ${prevDate.getUTCFullYear()}`;
    }
    return `${MONTH_NAMES[monthIdx]} ${year}`;
  }

  if (normFreq === 'quarterly') {
    // Standard Indian Financial Year Quarter Mapping:
    // Q1: Apr-Jun (months 3, 4, 5)
    // Q2: Jul-Sep (months 6, 7, 8)
    // Q3: Oct-Dec (months 9, 10, 11)
    // Q4: Jan-Mar (months 0, 1, 2)
    let qIndex = Math.floor(((monthIdx + 9) % 12) / 3); // 0 = Q1, 1 = Q2, 2 = Q3, 3 = Q4
    let qYear = monthIdx < 3 ? year - 1 : year; // FY start year

    if (offset === 'previous') {
      qIndex -= 1;
      if (qIndex < 0) {
        qIndex = 3;
        qYear -= 1;
      }
    }

    const quarterLabels = [
      `Q1 (Apr-Jun) ${qYear}`,
      `Q2 (Jul-Sep) ${qYear}`,
      `Q3 (Oct-Dec) ${qYear}`,
      `Q4 (Jan-Mar) ${qYear + 1}`
    ];

    return quarterLabels[qIndex];
  }

  if (normFreq === 'half_yearly') {
    // H1: Apr-Sep (months 3-8), H2: Oct-Mar (months 9-11, 0-2)
    let hIndex = monthIdx >= 3 && monthIdx <= 8 ? 0 : 1;
    let hYear = monthIdx < 3 ? year - 1 : year;

    if (offset === 'previous') {
      if (hIndex === 0) {
        hIndex = 1;
        hYear -= 1;
      } else {
        hIndex = 0;
      }
    }

    return hIndex === 0 ? `H1 (Apr-Sep) ${hYear}` : `H2 (Oct-Mar) ${hYear + 1}`;
  }

  if (normFreq === 'yearly') {
    // Indian FY: Apr to Mar
    let fyStartYear = monthIdx < 3 ? year - 1 : year;
    if (offset === 'previous') {
      fyStartYear -= 1;
    }
    const nextYearShort = String((fyStartYear + 1) % 100).padStart(2, '0');
    return `FY ${fyStartYear}-${nextYearShort}`;
  }

  // Fallback
  return `${MONTH_NAMES[monthIdx]} ${year}`;
};

/**
 * Calculates the exact due date capped at the max days of the target month
 */
export const calculateDueDate = (
  dueDay: number,
  referenceDate: Date = new Date(),
  dueMonthOffset: number = 0
): Date => {
  const refYear = referenceDate.getUTCFullYear();
  const refMonth = referenceDate.getUTCMonth();

  const targetDate = new Date(Date.UTC(refYear, refMonth + dueMonthOffset, 1));
  const targetYear = targetDate.getUTCFullYear();
  const targetMonth = targetDate.getUTCMonth();

  // Days in target month
  const maxDays = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(Math.max(dueDay, 1), maxDays);

  return new Date(Date.UTC(targetYear, targetMonth, clampedDay, 23, 59, 59, 999));
};

/**
 * Resolves whether a recurring service is scheduled to spawn on a given date
 */
export const shouldSpawnToday = (
  frequencyConfig?: {
    type?: string;
    creationDay?: number;
    creationMonthOffset?: string;
  },
  today: Date = new Date()
): boolean => {
  if (!frequencyConfig || !frequencyConfig.type) return false;
  if (frequencyConfig.type === 'one_time') return false;

  const currentDay = today.getUTCDate();
  const maxDaysThisMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)
  ).getUTCDate();

  const targetCreationDay = frequencyConfig.creationDay || 1;
  const effectiveCreationDay = Math.min(targetCreationDay, maxDaysThisMonth);

  return currentDay === effectiveCreationDay;
};
