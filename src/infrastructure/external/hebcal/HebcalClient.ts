/**
 * Hebcal Client - Hebrew Calendar Integration
 *
 * Integrates with @hebcal/core for:
 * - Jewish holiday detection
 * - Shabbat time calculations
 * - Hebrew date conversion
 */

import { HebrewCalendar, Location, Event as HebcalEvent, HDate, Zmanim } from '@hebcal/core';
import { DateTime } from 'luxon';
import logger from '../../../utils/logger.js';
import { BasePlugin, PluginContext } from '../../../plugins/IPlugin.js';

export interface HebcalConfig {
  defaultLocation?: LocationConfig;
  includeMinorHolidays?: boolean;
  candleLightingMins?: number; // Minutes before sunset for candle lighting
}

export interface LocationConfig {
  name: string;
  latitude: number;
  longitude: number;
  tzid: string;
}

export interface HolidayCheckResult {
  isHoliday: boolean;
  isShabbat: boolean;
  holidayName?: string;
  hebrewDate: string;
  severity?: 'block' | 'warn' | 'info';
  message?: string;
  shabbatTimes?: {
    start: DateTime;
    end: DateTime;
  };
}

/**
 * Hebcal Client Plugin
 */
export class HebcalClient extends BasePlugin<Date, HolidayCheckResult, HebcalConfig> {
  readonly name = 'hebcal-client';
  readonly version = '1.0.0';
  readonly type = 'external-api' as const;
  readonly description = 'Hebrew calendar and holiday checker';

  private defaultLocation!: Location; // Initialized in initialize()
  private includeMinorHolidays: boolean = false;
  private candleLightingMins: number = 18;

  // Israeli cities with their coordinates
  private static readonly ISRAELI_CITIES: Record<string, LocationConfig> = {
    jerusalem: {
      name: 'Jerusalem',
      latitude: 31.7683,
      longitude: 35.2137,
      tzid: 'Asia/Jerusalem'
    },
    telaviv: {
      name: 'Tel Aviv',
      latitude: 32.0853,
      longitude: 34.7818,
      tzid: 'Asia/Jerusalem'
    },
    haifa: {
      name: 'Haifa',
      latitude: 32.7940,
      longitude: 34.9896,
      tzid: 'Asia/Jerusalem'
    },
    beersheba: {
      name: 'Be\'er Sheva',
      latitude: 31.2518,
      longitude: 34.7913,
      tzid: 'Asia/Jerusalem'
    },
    eilat: {
      name: 'Eilat',
      latitude: 29.5581,
      longitude: 34.9482,
      tzid: 'Asia/Jerusalem'
    },
    netanya: {
      name: 'Netanya',
      latitude: 32.3215,
      longitude: 34.8532,
      tzid: 'Asia/Jerusalem'
    }
  };

  async initialize(config?: HebcalConfig): Promise<void> {
    await super.initialize(config);

    // Set default location (Jerusalem if not specified)
    const locationConfig = config?.defaultLocation || HebcalClient.ISRAELI_CITIES.jerusalem;
    this.defaultLocation = new Location(
      locationConfig.latitude,
      locationConfig.longitude,
      false, // Israel
      locationConfig.tzid,
      locationConfig.name
    );

    this.includeMinorHolidays = config?.includeMinorHolidays ?? false;
    this.candleLightingMins = config?.candleLightingMins ?? 18;

    logger.info(`HebcalClient initialized with location: ${this.defaultLocation.getName()}`);
  }

  async execute(date: Date, context: PluginContext): Promise<HolidayCheckResult> {
    this.assertInitialized();

    try {
      const hDate = new HDate(date);
      const hebrewDate = hDate.toString();

      // Check for holidays on this date
      const holidays = HebrewCalendar.calendar({
        start: hDate,
        end: hDate,
        location: this.defaultLocation,
        candlelighting: true,
        sedrot: false,
        noMinorFast: !this.includeMinorHolidays,
        noModern: !this.includeMinorHolidays
      });

      // Filter to major holidays only
      const majorHolidays = holidays.filter((ev: HebcalEvent) => {
        const desc = ev.getDesc();
        return this.isMajorHoliday(desc);
      });

      const isHoliday = majorHolidays.length > 0;
      const holidayEvent = majorHolidays[0];
      const holidayName = holidayEvent?.render('he');
      const holidayDesc = holidayEvent?.getDesc(); // English description for severity matching

      // Check if it's Shabbat
      const isShabbat = hDate.getDay() === 6; // Saturday

      // Get Shabbat times if Friday or Saturday
      let shabbatTimes: { start: DateTime; end: DateTime } | undefined;
      const dayOfWeek = date.getDay();

      if (dayOfWeek === 5 || dayOfWeek === 6) {
        // Friday or Saturday
        shabbatTimes = await this.getShabbatTimes(date);
      }

      // Determine severity
      let severity: 'block' | 'warn' | 'info' | undefined;
      let message: string | undefined;

      if (isHoliday) {
        severity = this.getHolidaySeverity(holidayDesc || holidayName);
        message = `⚠️ ${holidayName} - רוב המקומות סגורים`;
      } else if (isShabbat) {
        severity = 'warn';
        message = '⚠️ התאריך הוא בשבת';
      }

      return {
        isHoliday,
        isShabbat,
        holidayName,
        hebrewDate,
        severity,
        message,
        shabbatTimes
      };

    } catch (error) {
      context.logger.error('Hebcal check failed', { error, date });
      throw error;
    }
  }

  /**
   * Get Shabbat times for a given date
   */
  private async getShabbatTimes(date: Date): Promise<{ start: DateTime; end: DateTime }> {
    // Get Friday of the week
    const dayOfWeek = date.getDay();
    const daysToFriday = dayOfWeek === 5 ? 0 : dayOfWeek === 6 ? -1 : 5 - dayOfWeek;
    const friday = new Date(date);
    friday.setDate(friday.getDate() + daysToFriday);

    const hDate = new HDate(friday);

    // Get Zmanim (times) for Friday
    const zmanim = new Zmanim(this.defaultLocation, hDate, false);
    const candleLighting = zmanim.sunsetOffset(-this.candleLightingMins);

    // Havdalah is on Saturday
    const saturday = new Date(friday);
    saturday.setDate(saturday.getDate() + 1);
    const hDateSat = new HDate(saturday);
    const zmanimSat = new Zmanim(this.defaultLocation, hDateSat, false);
    const havdalah = zmanimSat.tzeit(8.5); // 8.5 degrees below horizon

    return {
      start: DateTime.fromJSDate(candleLighting!, { zone: this.defaultLocation.getTzid() }),
      end: DateTime.fromJSDate(havdalah!, { zone: this.defaultLocation.getTzid() })
    };
  }

  /**
   * Check if a holiday name is considered "major"
   */
  private isMajorHoliday(desc: string): boolean {
    const majorHolidays = [
      'Rosh Hashana',
      'Yom Kippur',
      'Sukkot',
      'Shmini Atzeret',
      'Simchat Torah',
      'Pesach',
      'Shavuot',
      'Purim',
      'Chanukah'
    ];

    return majorHolidays.some(h => desc.includes(h));
  }

  /**
   * Get severity level for a holiday
   */
  private getHolidaySeverity(holidayName?: string): 'block' | 'warn' | 'info' {
    if (!holidayName) return 'info';

    // Holidays where almost everything is closed
    const blockHolidays = ['יום כיפור', 'Yom Kippur'];
    if (blockHolidays.some(h => holidayName.includes(h))) {
      return 'block';
    }

    // Major holidays with significant closures
    const warnHolidays = [
      'ראש השנה', 'Rosh Hashana',
      'פסח', 'Pesach',
      'סוכות', 'Sukkot',
      'שבועות', 'Shavuot'
    ];
    if (warnHolidays.some(h => holidayName.includes(h))) {
      return 'warn';
    }

    return 'info';
  }

  /**
   * Get location by city name
   */
  static getLocationByCity(cityName: string): LocationConfig | undefined {
    const normalized = cityName.toLowerCase().trim();
    return this.ISRAELI_CITIES[normalized];
  }

  /**
   * Get all available cities
   */
  static getAvailableCities(): LocationConfig[] {
    return Object.values(this.ISRAELI_CITIES);
  }

  getSupportedCapabilities(): string[] {
    return [
      'holiday-detection',
      'shabbat-times',
      'hebrew-date-conversion',
      'israeli-cities'
    ];
  }
}
