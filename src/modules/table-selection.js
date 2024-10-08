import Quill from 'quill'
import { css, getRelativeRect } from '../utils'
import { TableCell } from '../formats/table'

const PRIMARY_COLOR = '#f88539'
const LINE_POSITIONS = ['left', 'right', 'top', 'bottom']
const ERROR_LIMIT = 2

export default class TableSelection {
  constructor (table, quill, options) {
    if (!table) return null
    this.table = table
    this.quill = quill
    this.options = options
    this.boundary = {}
    this.selectedTds = []
    this.dragging = false
    this.selectingHandler = this.mouseDownHandler.bind(this)
    this.clearSelectionHandler  = this.clearSelection.bind(this)

    this.helpLinesInitial()
    this.quill.root.addEventListener('mousedown',
        this.selectingHandler,
        false)

    this.quill.on('text-change', this.clearSelectionHandler )
  }

  helpLinesInitial () {
    let parent = this.quill.root.parentNode
    LINE_POSITIONS.forEach(direction => {
      this[direction] = document.createElement('div')
      this[direction].classList.add('qlbt-selection-line')
      this[direction].classList.add('qlbt-selection-line-' + direction)
      css(this[direction], {
        position: 'absolute',
        display: 'none',
        'background-color': PRIMARY_COLOR
      })
      parent.appendChild(this[direction])
    })
  }

  mouseDownHandler (e) {
    if (e.target.closest('caption')) return;
    if (e.button !== 0 || !e.target.closest(".quill-table-plus")) return;
    this.quill.root.addEventListener('mousemove', mouseMoveHandler, false)
    this.quill.root.addEventListener('mouseup', mouseUpHandler, false)

    const self = this
    const startTd = e.target.closest('td[data-row]')
    const startTdRect = getRelativeRect(
        startTd.getBoundingClientRect(),
        this.quill.root.parentNode
    )
    this.dragging = true
    this.boundary = computeBoundaryFromRects(startTdRect, startTdRect)
    this.correctBoundary()
    this.selectedTds = this.computeSelectedTds()
    this.repositionHelpLines()

    function mouseMoveHandler (e) {
      if (e.button !== 0 || !e.target.closest(".quill-table-plus")) return
      const endTd = e.target.closest('td[data-row]')
      // TODO: 여기에서 endTd가 null이어서 에러가 발생하는 경우가 있음. 왜 그런지 살펴보기
      if (!endTd) return;

      const endTdRect = getRelativeRect(
          endTd.getBoundingClientRect(),
          self.quill.root.parentNode
      )
      self.boundary = computeBoundaryFromRects(startTdRect, endTdRect)
      self.correctBoundary()
      self.selectedTds = self.computeSelectedTds()
      self.repositionHelpLines()

      // avoid select text in multiple table-cell
      if (startTd !== endTd) {
        self.quill.blur()
      }
    }

    function mouseUpHandler (e) {
      self.quill.root.removeEventListener('mousemove', mouseMoveHandler, false)
      self.quill.root.removeEventListener('mouseup', mouseUpHandler, false)
      self.dragging = false
    }
  }

  correctBoundary () {
    const tableContainer = Quill.find(this.table)
    const tableCells = tableContainer.descendants(TableCell)

    tableCells.forEach(tableCell => {
      let { x, y, width, height } = getRelativeRect(
          tableCell.domNode.getBoundingClientRect(),
          this.quill.root.parentNode
      )
      let isCellIntersected = (
          (x + ERROR_LIMIT >= this.boundary.x && x + ERROR_LIMIT <= this.boundary.x1) ||
          (x - ERROR_LIMIT + width >= this.boundary.x && x - ERROR_LIMIT + width <= this.boundary.x1)
      ) && (
          (y + ERROR_LIMIT >= this.boundary.y && y + ERROR_LIMIT <= this.boundary.y1) ||
          (y - ERROR_LIMIT + height >= this.boundary.y && y - ERROR_LIMIT + height <= this.boundary.y1)
      )
      if (isCellIntersected) {
        this.boundary = computeBoundaryFromRects(this.boundary, { x, y, width, height })
      }
    })
  }

  computeSelectedTds () {
    const tableContainer = Quill.find(this.table)
    const tableCells = tableContainer.descendants(TableCell)

    return tableCells.reduce((selectedCells, tableCell) => {
      let { x, y, width, height } = getRelativeRect(
          tableCell.domNode.getBoundingClientRect(),
          this.quill.root.parentNode
      )
      let isCellIncluded = (
          x + ERROR_LIMIT >= this.boundary.x &&
          x - ERROR_LIMIT + width <= this.boundary.x1
      ) && (
          y + ERROR_LIMIT >= this.boundary.y &&
          y - ERROR_LIMIT + height <= this.boundary.y1
      )

      if (isCellIncluded) {
        selectedCells.push(tableCell)
      }

      return selectedCells
    }, [])
  }

  repositionHelpLines () {
    const tableViewScrollLeft = this.table.parentNode.scrollLeft
    css(this.left, {
      display: 'block',
      left: `${this.boundary.x - tableViewScrollLeft - 1}px`,
      top: `${this.boundary.y}px`,
      height: `${this.boundary.height + 1}px`,
      width: '1px'
    })

    css(this.right, {
      display: 'block',
      left: `${this.boundary.x1 - tableViewScrollLeft}px`,
      top: `${this.boundary.y}px`,
      height: `${this.boundary.height + 1}px`,
      width: '1px'
    })

    css(this.top, {
      display: 'block',
      left: `${this.boundary.x - 1 - tableViewScrollLeft}px`,
      top: `${this.boundary.y}px`,
      width: `${this.boundary.width + 1}px`,
      height: '1px'
    })

    css(this.bottom, {
      display: 'block',
      left: `${this.boundary.x - 1 - tableViewScrollLeft}px`,
      top: `${this.boundary.y1 + 1}px`,
      width: `${this.boundary.width + 1}px`,
      height: '1px'
    })
  }

  // based on selectedTds compute positions of help lines
  // It is useful when selectedTds are not changed
  refreshHelpLinesPosition () {
    const startRect = getRelativeRect(
        this.selectedTds[0].domNode.getBoundingClientRect(),
        this.quill.root.parentNode
    )
    const endRect = getRelativeRect(
        this.selectedTds[this.selectedTds.length - 1].domNode.getBoundingClientRect(),
        this.quill.root.parentNode
    )
    this.boundary = computeBoundaryFromRects(startRect, endRect)
    this.repositionHelpLines()
  }

  destroy () {
    LINE_POSITIONS.forEach(direction => {
      this[direction].remove()
      this[direction] = null
    })

    this.quill.root.removeEventListener('mousedown',
        this.selectingHandler,
        false)

    this.quill.off('text-change', this.clearSelectionHandler )

    return null
  }

  setSelection (startRect, endRect) {
    this.boundary = computeBoundaryFromRects(
        getRelativeRect(startRect, this.quill.root.parentNode),
        getRelativeRect(endRect, this.quill.root.parentNode)
    )
    this.correctBoundary()
    this.selectedTds = this.computeSelectedTds()
    this.repositionHelpLines()
  }

  clearSelection () {
    this.boundary = {}
    this.selectedTds = []
    LINE_POSITIONS.forEach(direction => {
      this[direction] && css(this[direction], {
        display: 'none'
      })
    })
  }

  equalizeColumnWidths() {
    const selectedCells = this.selectedTds.map(td => td.domNode);
    if (selectedCells.length === 0) return;

    const selectedColumns = new Set();
    selectedCells.forEach(cell => {
      const colIndex = Array.from(cell.parentElement.children).indexOf(cell);
      selectedColumns.add(colIndex);
    });

    let totalWidth = 0;
    let columnCount = 0;

    selectedColumns.forEach(index => {
      const cell = selectedCells.find(cell => Array.from(cell.parentElement.children).indexOf(cell) === index);
      if (cell) {
        totalWidth += cell.clientWidth;
        columnCount += 1;
      }
    });

    const averageWidth = totalWidth / columnCount;

    selectedColumns.forEach(colIndex => {
      const tableContainer = Quill.find(this.table);
      const colBlot = tableContainer.colGroup().children.at(colIndex);

      colBlot.format('width', averageWidth);

      selectedCells.forEach(cell => {
        if (Array.from(cell.parentElement.children).indexOf(cell) === colIndex) {
          css(cell, { 'width': `${averageWidth}px` });
        }
      });
    });

    this.quill.update(Quill.sources.USER);
  }

  equalizeRowHeights() {
    const selectedCells = this.selectedTds.map(td => td.domNode);
    if (selectedCells.length === 0) return;

    const selectedRows = new Set();
    selectedCells.forEach(cell => {
      const rowIndex = Array.from(cell.parentElement.parentElement.children).indexOf(cell.parentElement);
      selectedRows.add(rowIndex);
    });

    let totalHeight = 0;
    let rowCount = 0;

    selectedRows.forEach(rowIndex => {
      const rowElement = selectedCells.find(cell => Array.from(cell.parentElement.parentElement.children).indexOf(cell.parentElement) === rowIndex)?.parentElement;
      if (rowElement) {
        totalHeight += rowElement.clientHeight;
        rowCount += 1;
      }
    });

    const averageHeight = totalHeight / rowCount;

    selectedRows.forEach(rowIndex => {
      const rowElements = Array.from(this.table.querySelectorAll('tr'));
      const rowElement = rowElements[rowIndex];

      if (rowElement) {
        rowElement.style.height = `${averageHeight}px`;
      }
    });

    this.quill.update(Quill.sources.USER);
  }
}

function computeBoundaryFromRects (startRect, endRect) {
  let x = Math.min(
      startRect.x,
      endRect.x,
      startRect.x + startRect.width - 1,
      endRect.x + endRect.width - 1
  )

  let x1 = Math.max(
      startRect.x,
      endRect.x,
      startRect.x + startRect.width - 1,
      endRect.x + endRect.width - 1
  )

  let y = Math.min(
      startRect.y,
      endRect.y,
      startRect.y + startRect.height - 1,
      endRect.y + endRect.height - 1
  )

  let y1 = Math.max(
      startRect.y,
      endRect.y,
      startRect.y + startRect.height - 1,
      endRect.y + endRect.height - 1
  )

  let width = x1 - x
  let height = y1 - y

  return { x, x1, y, y1, width, height }
}
