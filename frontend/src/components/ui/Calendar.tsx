import React, { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'
import { cn } from '@/utils'

interface CalendarEvent {
  id: string
  title: string
  date: Date | string
  time: string
  color?: string
  onClick?: () => void
}

interface CalendarProps {
  events: CalendarEvent[]
  onDateClick?: (date: Date) => void
  onEventClick?: (event: CalendarEvent) => void
}

export const Calendar: React.FC<CalendarProps> = ({ events, onDateClick, onEventClick }) => {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'month' | 'week'>('month')

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    return { daysInMonth, startingDayOfWeek, year, month }
  }

  const getWeekDays = (date: Date) => {
    const dayOfWeek = date.getDay()
    const startOfWeek = new Date(date)
    startOfWeek.setDate(date.getDate() - dayOfWeek)

    const days = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek)
      day.setDate(startOfWeek.getDate() + i)
      days.push(day)
    }
    return days
  }

  const isSameDay = (date1: Date, date2: Date | string) => {
    const d2 = new Date(date2)
    return (
      date1.getDate() === d2.getDate() &&
      date1.getMonth() === d2.getMonth() &&
      date1.getFullYear() === d2.getFullYear()
    )
  }

  const getEventsForDate = (date: Date) => {
    return events.filter(event => isSameDay(date, event.date))
  }

  const previousPeriod = () => {
    const newDate = new Date(currentDate)
    if (view === 'month') {
      newDate.setMonth(currentDate.getMonth() - 1)
    } else {
      newDate.setDate(currentDate.getDate() - 7)
    }
    setCurrentDate(newDate)
  }

  const nextPeriod = () => {
    const newDate = new Date(currentDate)
    if (view === 'month') {
      newDate.setMonth(currentDate.getMonth() + 1)
    } else {
      newDate.setDate(currentDate.getDate() + 7)
    }
    setCurrentDate(newDate)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }

  const formatWeekRange = (days: Date[]) => {
    const first = days[0]
    const last = days[6]
    return `${first.getDate()} ${first.toLocaleDateString('pt-BR', { month: 'short' })} - ${last.getDate()} ${last.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}`
  }

  const renderMonthView = () => {
    const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate)
    const days = []
    const today = new Date()

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="min-h-[100px] bg-gray-50 border border-gray-200" />)
    }

    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      const dayEvents = getEventsForDate(date)
      const isToday = isSameDay(date, today)

      days.push(
        <div
          key={day}
          className={cn(
            'min-h-[100px] border border-gray-200 p-2 cursor-pointer hover:bg-gray-50 transition-colors',
            isToday && 'bg-blue-50 border-blue-300'
          )}
          onClick={() => onDateClick?.(date)}
        >
          <div className={cn(
            'text-sm font-medium mb-1',
            isToday ? 'text-blue-600' : 'text-gray-700'
          )}>
            {day}
          </div>
          <div className="space-y-1">
            {dayEvents.slice(0, 3).map(event => (
              <div
                key={event.id}
                className={cn(
                  'text-xs p-1 rounded cursor-pointer truncate',
                  event.color || 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  onEventClick?.(event)
                }}
              >
                {event.time} - {event.title}
              </div>
            ))}
            {dayEvents.length > 3 && (
              <div className="text-xs text-gray-500 pl-1">
                +{dayEvents.length - 3} mais
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="grid grid-cols-7 gap-0">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
          <div key={day} className="bg-gray-100 border border-gray-200 p-2 text-center font-semibold text-sm text-gray-700">
            {day}
          </div>
        ))}
        {days}
      </div>
    )
  }

  const renderWeekView = () => {
    const weekDays = getWeekDays(currentDate)
    const today = new Date()

    // Get time slots (8:00 to 20:00)
    const timeSlots: string[] = []
    for (let hour = 8; hour <= 20; hour++) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:00`)
    }

    return (
      <div className="flex">
        {/* Time column */}
        <div className="w-20 flex-shrink-0">
          <div className="h-12 border-b border-gray-200" /> {/* Header spacer */}
          {timeSlots.map(time => (
            <div key={time} className="h-16 border-b border-gray-200 pr-2 text-right text-xs text-gray-500 pt-1">
              {time}
            </div>
          ))}
        </div>

        {/* Days columns */}
        <div className="flex-1 grid grid-cols-7">
          {weekDays.map((date, index) => {
            const isToday = isSameDay(date, today)
            const dayEvents = getEventsForDate(date)

            return (
              <div key={index} className="border-l border-gray-200">
                {/* Day header */}
                <div className={cn(
                  'h-12 border-b border-gray-200 p-2 text-center',
                  isToday && 'bg-blue-50'
                )}>
                  <div className="text-xs text-gray-500">
                    {date.toLocaleDateString('pt-BR', { weekday: 'short' })}
                  </div>
                  <div className={cn(
                    'text-sm font-medium',
                    isToday ? 'text-blue-600' : 'text-gray-700'
                  )}>
                    {date.getDate()}
                  </div>
                </div>

                {/* Time slots */}
                <div className="relative">
                  {timeSlots.map((_, timeIndex) => (
                    <div
                      key={timeIndex}
                      className="h-16 border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                      onClick={() => onDateClick?.(date)}
                    />
                  ))}

                  {/* Events overlay */}
                  {dayEvents.map(event => {
                    const eventHour = parseInt(event.time.split(':')[0])
                    const eventMinute = parseInt(event.time.split(':')[1])
                    const topPosition = ((eventHour - 8) * 64) + (eventMinute / 60 * 64)

                    return (
                      <div
                        key={event.id}
                        className={cn(
                          'absolute left-1 right-1 p-1 rounded text-xs cursor-pointer',
                          event.color || 'bg-blue-500 text-white hover:bg-blue-600'
                        )}
                        style={{ top: `${topPosition}px`, height: '60px' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEventClick?.(event)
                        }}
                      >
                        <div className="font-medium truncate">{event.title}</div>
                        <div className="text-xs opacity-90">{event.time}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Calendar Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {view === 'month' ? formatMonthYear(currentDate) : formatWeekRange(getWeekDays(currentDate))}
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>
              Hoje
            </Button>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={previousPeriod}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={nextPeriod}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex gap-2">
          <Button
            variant={view === 'month' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setView('month')}
          >
            Mês
          </Button>
          <Button
            variant={view === 'week' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setView('week')}
          >
            Semana
          </Button>
        </div>
      </div>

      {/* Calendar Body */}
      <div className="p-4">
        {view === 'month' ? renderMonthView() : renderWeekView()}
      </div>
    </div>
  )
}
