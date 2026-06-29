import React from 'react'

interface TableProps {
  children: React.ReactNode
  className?: string
}

export const Table: React.FC<TableProps> = ({ children, className = '' }) => {
  return (
    <div className="w-full overflow-x-auto">
      <table className={`min-w-full divide-y divide-gray-200 dark:divide-gray-700 ${className}`}>
        {children}
      </table>
    </div>
  )
}

interface TableHeadProps {
  children: React.ReactNode
  className?: string
}

export const TableHead: React.FC<TableHeadProps> = ({ children, className = '' }) => {
  return (
    <thead className={`bg-gray-50 dark:bg-gray-900 ${className}`}>
      {children}
    </thead>
  )
}

interface TableBodyProps {
  children: React.ReactNode
  className?: string
}

export const TableBody: React.FC<TableBodyProps> = ({ children, className = '' }) => {
  return (
    <tbody className={`bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700 ${className}`}>
      {children}
    </tbody>
  )
}

interface TableRowProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export const TableRow: React.FC<TableRowProps> = ({ children, className = '', onClick }) => {
  return (
    <tr
      className={`${onClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  )
}

interface TableHeaderCellProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export const TableHeaderCell: React.FC<TableHeaderCellProps> = ({ children, className = '', onClick }) => {
  return (
    <th
      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${
        onClick ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : ''
      } ${className}`}
      onClick={onClick}
    >
      {children}
    </th>
  )
}

interface TableCellProps {
  children: React.ReactNode
  className?: string
}

export const TableCell: React.FC<TableCellProps> = ({ children, className = '' }) => {
  return (
    <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white ${className}`}>
      {children}
    </td>
  )
}
