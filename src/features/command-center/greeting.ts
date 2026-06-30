export const DEFAULT_COMMAND_CENTER_TIMEZONE = 'Asia/Ho_Chi_Minh'

export type CommandCenterGreetingPeriod = 'morning' | 'noon' | 'afternoon' | 'evening' | 'late'

export interface CommandCenterGreeting {
  period: CommandCenterGreetingPeriod
  title: string
  subtitle: string
  iconClass: string
}

export function resolveCommandCenterTimeZone(timeZone?: string | null): string {
  const candidate = timeZone?.trim() || DEFAULT_COMMAND_CENTER_TIMEZONE

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return DEFAULT_COMMAND_CENTER_TIMEZONE
  }
}

export function getCommandCenterGreeting(
  date: Date,
  timeZone = DEFAULT_COMMAND_CENTER_TIMEZONE,
  userName = 'Quang',
): CommandCenterGreeting {
  const zone = resolveCommandCenterTimeZone(timeZone)
  const { hour, minute } = getZonedHourMinute(date, zone)
  const totalMinutes = hour * 60 + minute
  const displayName = userName.trim() || 'Quang'

  if (totalMinutes >= minutesAt(5, 0) && totalMinutes <= minutesAt(10, 59)) {
    return {
      period: 'morning',
      title: `Chào buổi sáng, ${displayName}`,
      subtitle: 'Đây là các việc cần nắm trước khi bắt đầu ngày làm việc.',
      iconClass: 'ti-sun',
    }
  }

  if (totalMinutes >= minutesAt(11, 0) && totalMinutes <= minutesAt(13, 29)) {
    return {
      period: 'noon',
      title: `Chào buổi trưa, ${displayName}`,
      subtitle: 'Kiểm tra nhanh các việc đang chờ phản hồi và deadline trong ngày.',
      iconClass: 'ti-sun-high',
    }
  }

  if (totalMinutes >= minutesAt(13, 30) && totalMinutes <= minutesAt(17, 59)) {
    return {
      period: 'afternoon',
      title: `Chào buổi chiều, ${displayName}`,
      subtitle: 'Đây là thời điểm tốt để dí file, chốt việc và chuẩn bị báo cáo cuối ngày.',
      iconClass: 'ti-sunset-2',
    }
  }

  if (totalMinutes >= minutesAt(18, 0) && totalMinutes <= minutesAt(21, 59)) {
    return {
      period: 'evening',
      title: `Chào buổi tối, ${displayName}`,
      subtitle: 'Cập nhật lại các việc còn treo, việc quá hạn và mục cần báo CEO.',
      iconClass: 'ti-moon',
    }
  }

  return {
    period: 'late',
    title: 'Khuya rồi, kiểm tra nhanh thôi',
    subtitle: 'Chỉ nên xử lý việc thật sự khẩn cấp và để lại nhắc việc cho ngày mai.',
    iconClass: 'ti-moon-stars',
  }
}

export function formatCommandCenterDateTime(
  date: Date,
  timeZone = DEFAULT_COMMAND_CENTER_TIMEZONE,
): string {
  const zone = resolveCommandCenterTimeZone(timeZone)
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const weekday = capitalizeFirst(getDatePart(parts, 'weekday'))
  const day = getDatePart(parts, 'day')
  const month = getDatePart(parts, 'month')
  const year = getDatePart(parts, 'year')
  const hour = getDatePart(parts, 'hour')
  const minute = getDatePart(parts, 'minute')

  return `${weekday}, ${day} tháng ${month}, ${year} · ${hour}:${minute}`
}

function getZonedHourMinute(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const rawHour = Number(getDatePart(parts, 'hour'))
  const hour = rawHour === 24 ? 0 : rawHour
  const minute = Number(getDatePart(parts, 'minute'))

  return { hour, minute }
}

function getDatePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? ''
}

function minutesAt(hour: number, minute: number) {
  return hour * 60 + minute
}

function capitalizeFirst(value: string) {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}
