import Quill from "quill"
import { css, getRelativeRect } from '../utils'
import Header from './header'

const Break = Quill.import("blots/break")
const Block = Quill.import("blots/block")
const Container = Quill.import("blots/container")

const COL_ATTRIBUTES = ["width"]
const COL_DEFAULT = {
  width: 100
}
const CELL_IDENTITY_KEYS = ["row", "cell"]
const CELL_ATTRIBUTES = ["rowspan", "colspan"]
const CELL_DEFAULT = {
  rowspan: 1,
  colspan: 1
}
const ERROR_LIMIT = 5
const CELL_MIN_WIDTH = 50
const ROW_MIN_HEIGHT = 10;


class TableCellLine extends Block {
  static create(value) {
    const node = super.create(value)

    CELL_IDENTITY_KEYS.forEach(key => {
      let identityMaker = key === 'row'
          ? rowId : cellId
      node.setAttribute(`data-${key}`, value[key] || identityMaker())
    })

    CELL_ATTRIBUTES.forEach(attrName => {
      node.setAttribute(`data-${attrName}`, value[attrName] || CELL_DEFAULT[attrName])
    })

    if (value['cell-bg']) {
      node.setAttribute('data-cell-bg', value['cell-bg'])
    }

    return node
  }

  static formats(domNode) {
    const formats = {}

    return CELL_ATTRIBUTES.concat(CELL_IDENTITY_KEYS).concat(['cell-bg']).reduce((formats, attribute) => {
      if (domNode.hasAttribute(`data-${attribute}`)) {
        formats[attribute] = domNode.getAttribute(`data-${attribute}`) || undefined
      }
      return formats
    }, formats)
  }

  format(name, value) {
    if (CELL_ATTRIBUTES.concat(CELL_IDENTITY_KEYS).indexOf(name) > -1) {
      if (value) {
        this.domNode.setAttribute(`data-${name}`, value)
      } else {
        this.domNode.removeAttribute(`data-${name}`)
      }
    } else if (name === 'cell-bg') {
      if (value) {
        this.domNode.setAttribute('data-cell-bg', value)
      } else {
        this.domNode.removeAttribute('data-cell-bg')
      }
    } else if (name === 'header') {
      if (!value) return;
      const { row, cell, rowspan, colspan } = TableCellLine.formats(this.domNode)
      super.format(name, {
        value,
        row,
        cell,
        rowspan,
        colspan
      })
    } else {
      super.format(name, value)
    }
  }

  optimize(context) {
    // cover shadowBlot's wrap call, pass params parentBlot initialize
    // needed
    const rowId = this.domNode.getAttribute('data-row')
    const rowspan = this.domNode.getAttribute('data-rowspan')
    const colspan = this.domNode.getAttribute('data-colspan')
    const cellBg = this.domNode.getAttribute('data-cell-bg')
    if (this.statics.requiredContainer &&
        !(this.parent instanceof this.statics.requiredContainer)) {
      this.wrap(this.statics.requiredContainer.blotName, {
        row: rowId,
        colspan,
        rowspan,
        'cell-bg': cellBg
      })
    }
    super.optimize(context)
  }

  tableCell() {
    return this.parent
  }
}
TableCellLine.blotName = "table-cell-line"
TableCellLine.className = "qlbt-cell-line"
TableCellLine.tagName = "P"

class TableCell extends Container {
  constructor(scroll, domNode) {
    super(scroll, domNode);

    this.dragging = false;
    this.helpLine = null;
    this.initialClientX = 0;
    this.currentClientX = 0;
    this.initialWidth = 0;
    this.tableRect = {};
    this.cellRect = {};
    this.delta = 0;
    this.draggingFromLeft = false;

    this.addEventListeners();
  }

  handleDrag = e => {
    e.preventDefault();

    this.currentClientX = e.clientX;

    if (this.draggingFromLeft) {
      const previousCell = this.domNode.previousSibling;

      if (previousCell) {
        const delta = this.currentClientX - this.initialClientX;
        const newPreviousWidth = this.previousCellWidth + delta;

        if (newPreviousWidth >= CELL_MIN_WIDTH) {
          previousCell.style.width = `${newPreviousWidth}px`;
          this.delta = delta;
        } else {
          this.delta = CELL_MIN_WIDTH - this.previousCellWidth;
          previousCell.style.width = `${CELL_MIN_WIDTH}px`;
        }

        css(this.helpLine, {
          'left': `${this.cellRect.left + this.delta}px`
        });
      }
    } else {
      if (this.initialWidth + (this.currentClientX - this.initialClientX) >= CELL_MIN_WIDTH) {
        this.delta = this.currentClientX - this.initialClientX;
      } else {
        this.delta = CELL_MIN_WIDTH - this.initialWidth;
      }

      css(this.helpLine, {
        'left': `${this.cellRect.left + this.cellRect.width + this.delta}px`
      });
    }
  }

  handleMouseUp = (e) => {
    e.preventDefault();

    const tableContainer = Quill.find(this.domNode.closest('table'));

    if (!this.domNode.parentNode || !this.domNode.parentNode.children) return;

    const colIndex = Array.from(this.domNode.parentNode.children).indexOf(this.domNode);
    const colGroup = tableContainer.colGroup();
    const colBlot = colGroup && colGroup.children.at(colIndex);

    if (this.dragging) {
      if (this.draggingFromLeft) {
        const previousCell = this.domNode.previousSibling;
        if (previousCell) {
          const newWidth = this.previousCellWidth + this.delta;
          const previousColIndex = colIndex - 1;
          const previousColBlot = colGroup && colGroup.children.at(previousColIndex);

          if (previousColBlot) {
            previousColBlot.format('width', newWidth);
          }
        }
      } else {
        const newWidth = this.initialWidth + this.delta;
        colBlot.format('width', newWidth);
      }

      // clean up
      this.initialClientX = 0;
      this.currentClientX = 0;
      this.delta = 0;
      this.initialWidth = 0;
      this.previousCellWidth = 0;
      this.dragging = false;
      this.draggingFromLeft = false;
      document.body.style.cursor = 'default';
      if (this.helpLine) {
        document.body.removeChild(this.helpLine);
        this.helpLine = null;
      }

      tableContainer.updateTableWidth();
    }

    document.removeEventListener('mousemove', this.handleDrag, false);
    document.removeEventListener('mouseup', this.handleMouseUp, false);
  };

  handleMouseDown = (e) => {
    const edgeType = this.isOnEdge(e);
    if (!edgeType) return;

    document.addEventListener('mousemove', this.handleDrag, false);
    document.addEventListener('mouseup', this.handleMouseUp, false);

    e.preventDefault();

    this.dragging = true;
    this.draggingFromLeft = edgeType === 'left';
    this.initialClientX = e.clientX;
    this.tableRect = this.domNode.closest('table').getBoundingClientRect();
    this.cellRect = this.domNode.getBoundingClientRect();
    this.initialWidth = this.cellRect.width;

    if (this.draggingFromLeft) {
      const previousCell = this.domNode.previousSibling;
      if (previousCell) {
        this.previousCellWidth = previousCell.getBoundingClientRect().width;
      }
    }

    this.helpLine = document.createElement('div');
    css(this.helpLine, {
      position: 'fixed',
      top: `${this.tableRect.top}px`,
      left: `${this.draggingFromLeft ? this.cellRect.left - 1 : this.cellRect.left + this.cellRect.width - 1}px`,
      zIndex: '100',
      height: `${this.tableRect.height}px`,
      width: '1px',
      backgroundColor: '#f88539',
    });
    document.body.appendChild(this.helpLine);

    document.body.style.cursor = 'ew-resize';
  };

  handleMouseMove = (e) => {
    const edgeType = this.isOnEdge(e);
    if (edgeType === 'bottom') {
      this.applyCursorToCells('ns-resize');
    } else {
      this.applyCursorToCells('default');
    }
  };

  applyCursorToCells(cursorStyle) {
    Array.from(this.domNode.querySelectorAll('td')).forEach(td => {
      td.style.cursor = cursorStyle;
    });
  }

  addEventListeners() {
    this.domNode.addEventListener('mousedown', this.handleMouseDown);
    this.domNode.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('resize', this.updateTableWidth.bind(this));
  }

  updateTableWidth() {
    const table = this.domNode.closest('table');
    if (table) {
      const colGroup = table.querySelector('colgroup');
      if (colGroup) {
        let totalWidth = 0;
        colGroup.querySelectorAll('col').forEach((col) => {
          totalWidth += parseInt(col.style.width, 10);
        });
        table.style.width = `${totalWidth}px`;
      }
    }
  }

  isOnEdge(event) {
    const rect = this.domNode.getBoundingClientRect();
    const offset = 5;
    if (event.clientX >= rect.right - offset && event.clientX <= rect.right + offset) {
      return 'right';
    } else if (event.clientX >= rect.left - offset && event.clientX <= rect.left + offset) {
      return 'left';
    }
    return null;
  }

  checkMerge() {
    if (super.checkMerge() && this.next.children.head != null) {
      const thisHead = this.children.head.formats()[this.children.head.statics.blotName]
      const thisTail = this.children.tail.formats()[this.children.tail.statics.blotName]
      const nextHead = this.next.children.head.formats()[this.next.children.head.statics.blotName]
      const nextTail = this.next.children.tail.formats()[this.next.children.tail.statics.blotName]
      return (
          thisHead.cell === thisTail.cell &&
          thisHead.cell === nextHead.cell &&
          thisHead.cell === nextTail.cell
      )
    }
    return false
  }

  static create(value) {
    const node = super.create(value)
    node.setAttribute("data-row", value.row)

    CELL_ATTRIBUTES.forEach(attrName => {
      if (value[attrName]) {
        node.setAttribute(attrName, value[attrName])
      }
    })

    if (value['cell-bg']) {
      node.setAttribute('data-cell-bg', value['cell-bg'])
      node.style.backgroundColor = value['cell-bg']
    }

    return node
  }

  static formats(domNode) {
    const formats = {}

    if (domNode.hasAttribute("data-row")) {
      formats["row"] = domNode.getAttribute("data-row")
    }

    if (domNode.hasAttribute("data-cell-bg")) {
      formats["cell-bg"] = domNode.getAttribute("data-cell-bg")
    }

    return CELL_ATTRIBUTES.reduce((formats, attribute) => {
      if (domNode.hasAttribute(attribute)) {
        formats[attribute] = domNode.getAttribute(attribute)
      }

      return formats
    }, formats)
  }

  cellOffset() {
    if (this.parent) {
      return this.parent.children.indexOf(this)
    }
    return -1
  }

  formats() {
    const formats = {}

    if (this.domNode.hasAttribute("data-row")) {
      formats["row"] = this.domNode.getAttribute("data-row")
    }

    if (this.domNode.hasAttribute("data-cell-bg")) {
      formats["cell-bg"] = this.domNode.getAttribute("data-cell-bg")
    }

    return CELL_ATTRIBUTES.reduce((formats, attribute) => {
      if (this.domNode.hasAttribute(attribute)) {
        formats[attribute] = this.domNode.getAttribute(attribute)
      }

      return formats
    }, formats)
  }

  toggleAttribute (name, value) {
    if (value) {
      this.domNode.setAttribute(name, value)
    } else {
      this.domNode.removeAttribute(name)
    }
  }

  formatChildren (name, value) {
    this.children.forEach(child => {
      child.format(name, value)
    })
  }

  format(name, value) {
    if (CELL_ATTRIBUTES.indexOf(name) > -1) {
      this.toggleAttribute(name, value)
      this.formatChildren(name, value)
    } else if (['row'].indexOf(name) > -1) {
      this.toggleAttribute(`data-${name}`, value)
      this.formatChildren(name, value)
    } else if (name === 'cell-bg') {
      this.toggleAttribute('data-cell-bg', value)
      this.formatChildren(name, value)

      if (value) {
        this.domNode.style.backgroundColor = value
      } else {
        this.domNode.style.backgroundColor = 'initial'
      }
    } else {
      super.format(name, value)
    }
  }

  optimize(context) {
    const rowId = this.domNode.getAttribute("data-row")

    if (this.statics.requiredContainer &&
        !(this.parent instanceof this.statics.requiredContainer)) {
      this.wrap(this.statics.requiredContainer.blotName, {
        row: rowId
      })
    }
    super.optimize(context)
  }

  row() {
    return this.parent
  }

  rowOffset() {
    if (this.row()) {
      return this.row().rowOffset()
    }
    return -1
  }

  table() {
    return this.row() && this.row().table()
  }
}
TableCell.blotName = "table"
TableCell.tagName = "TD"

class TableRow extends Container {
  checkMerge() {
    if (super.checkMerge() && this.next.children.head != null) {
      const thisHead = this.children.head.formats()
      const thisTail = this.children.tail.formats()
      const nextHead = this.next.children.head.formats()
      const nextTail = this.next.children.tail.formats()

      return (
          thisHead.row === thisTail.row &&
          thisHead.row === nextHead.row &&
          thisHead.row === nextTail.row
      )
    }
    return false
  }

  static create(value) {
    const node = super.create(value)
    node.setAttribute("data-row", value.row)
    if (value.height) {
      node.style.height = `${value.height}px`;
      node.setAttribute('data-height', value.height);
    }
    return node
  }

  formats() {
    return ["row"].reduce((formats, attrName) => {
      if (this.domNode.hasAttribute(`data-${attrName}`)) {
        formats[attrName] = this.domNode.getAttribute(`data-${attrName}`)
      }
      return formats
    }, {})
  }

  optimize (context) {
    // optimize function of ShadowBlot
    if (
        this.statics.requiredContainer &&
        !(this.parent instanceof this.statics.requiredContainer)
    ) {
      this.wrap(this.statics.requiredContainer.blotName)
    }

    // optimize function of ParentBlot
    // note: modified this optimize function because
    // TableRow should not be removed when the length of its children was 0
    this.enforceAllowedChildren()
    if (this.uiNode != null && this.uiNode !== this.domNode.firstChild) {
      this.domNode.insertBefore(this.uiNode, this.domNode.firstChild)
    }

    // optimize function of ContainerBlot
    if (this.children.length > 0 && this.next != null && this.checkMerge()) {
      this.next.moveChildren(this)
      this.next.remove()
    }
  }

  rowOffset() {
    if (this.parent) {
      return this.parent.children.indexOf(this)
    }
    return -1
  }

  table() {
    return this.parent && this.parent.parent
  }

  constructor(scroll, domNode) {
    super(scroll, domNode);

    this.dragging = false;
    this.helpLine = null;
    this.initialClientY = 0;
    this.currentClientY = 0;
    this.initialHeight = 0;
    this.rowRect = {};
    this.delta = 0;
    this.draggingFromBottom = false;

    this.addEventListeners();
  }

  handleDrag = (e) => {
    e.preventDefault();
    this.currentClientY = e.clientY;

    if (this.initialHeight + (this.currentClientY - this.initialClientY) >= ROW_MIN_HEIGHT) {
      this.delta = this.currentClientY - this.initialClientY;
    } else {
      this.delta = ROW_MIN_HEIGHT - this.initialHeight;
    }

    css(this.helpLine, {
      'top': `${this.rowRect.top + this.rowRect.height + this.delta}px`
    });
  };

  handleMouseUp = (e) => {
    e.preventDefault();

    if (this.dragging) {
      const newHeight = this.initialHeight + this.delta;
      this.domNode.style.height = `${newHeight}px`;

      this.initialClientY = 0;
      this.currentClientY = 0;
      this.delta = 0;
      this.initialHeight = 0;
      this.dragging = false;
      document.body.style.cursor = 'default';

      if (this.helpLine) {
        document.body.removeChild(this.helpLine);
        this.helpLine = null;
      }

      this.updateTableHeight();
    }

    document.removeEventListener('mousemove', this.handleDrag, false);
    document.removeEventListener('mouseup', this.handleMouseUp, false);
  };

  handleMouseDown = (e) => {
    const edgeType = this.isOnEdge(e);
    if (!edgeType) return;

    document.addEventListener('mousemove', this.handleDrag, false);
    document.addEventListener('mouseup', this.handleMouseUp, false);

    e.preventDefault();
    this.dragging = true;
    this.initialClientY = e.clientY;
    this.rowRect = this.domNode.getBoundingClientRect();
    this.initialHeight = this.rowRect.height;

    this.helpLine = document.createElement('div');
    css(this.helpLine, {
      position: 'fixed',
      top: `${this.rowRect.top + this.rowRect.height - 1}px`,
      left: `${this.rowRect.left}px`,
      zIndex: '100',
      width: `${this.domNode.closest('table').getBoundingClientRect().width}px`,
      height: '1px',
      backgroundColor: '#f88539'
    });
    document.body.appendChild(this.helpLine);

    document.body.style.cursor = 'ns-resize';
  };

  handleMouseMove = (e) => {
    const edgeType = this.isOnEdge(e);
    if (edgeType) {
      this.domNode.style.cursor = 'ns-resize';
    } else {
      this.domNode.style.cursor = 'default';
    }
  };

  isOnEdge(event) {
    const rect = this.domNode.getBoundingClientRect();
    const offset = 5;
    if (event.clientY >= rect.bottom - offset && event.clientY <= rect.bottom + offset) {
      return 'bottom';
    }
    return null;
  }

  addEventListeners() {
    this.domNode.addEventListener('mousedown', this.handleMouseDown);
    this.domNode.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('resize', this.updateTableHeight.bind(this));
  }

  updateTableHeight() {
    const newHeight = this.domNode.getBoundingClientRect().height;
    this.domNode.style.height = `${newHeight}px`;
  }
}
TableRow.blotName = "table-row"
TableRow.tagName = "TR"

class TableBody extends Container {}
TableBody.blotName = "table-body"
TableBody.tagName = "TBODY"

class TableCol extends Block {
  static create (value) {
    let node = super.create(value)
    COL_ATTRIBUTES.forEach(attrName => {
      node.setAttribute(`${attrName}`, value[attrName] || COL_DEFAULT[attrName])
    })
    return node
  }

  static formats(domNode) {
    return COL_ATTRIBUTES.reduce((formats, attribute) => {
      if (domNode.hasAttribute(`${attribute}`)) {
        formats[attribute] =
            domNode.getAttribute(`${attribute}`) || undefined
      }
      return formats
    }, {})
  }

  format(name, value) {
    if (COL_ATTRIBUTES.indexOf(name) > -1) {
      this.domNode.setAttribute(`${name}`, value || COL_DEFAULT[name])
    } else {
      super.format(name, value)
    }
  }

  html () {
    return this.domNode.outerHTML
  }
}
TableCol.blotName = "table-col"
TableCol.tagName = "col"

class TableColGroup extends Container {}
TableColGroup.blotName = "table-col-group"
TableColGroup.tagName = "colgroup"



class TableContainer extends Container {
  static hasCaption = false;

  static create() {
    const node = super.create();

    if (!TableContainer.hasCaption) {
      const caption = TableCaption.create({ caption: 'Default Caption' });
      node.appendChild(caption);
      TableContainer.hasCaption = true;
    }

    return node;
  }

  constructor (scroll, domNode) {
    super(scroll, domNode)
    this.updateTableWidth()
  }

  updateTableWidth () {
    setTimeout(() => {
      const colGroup = this.colGroup()
      if (!colGroup) return
      const tableWidth = colGroup.children.reduce((sumWidth, col) => {
        sumWidth = sumWidth + parseInt(col.formats()[TableCol.blotName].width, 10)
        return sumWidth
      }, 0)
      this.domNode.style.width = `${tableWidth}px`
    }, 0)
  }

  cells(column) {
    return this.rows().map(row => row.children.at(column))
  }

  colGroup() {
    let currentBlot = this.children.head;
    while (currentBlot) {
      if (currentBlot.statics.blotName === 'table-col-group') {
        return currentBlot;
      }
      currentBlot = currentBlot.next;
    }
    return null;
  }

  deleteColumns(compareRect, delIndexes = [], editorWrapper) {
    const [body] = this.descendants(TableBody)
    if (body == null || body.children.head == null) return

    const tableCells = this.descendants(TableCell)
    const removedCells = []
    const modifiedCells = []

    tableCells.forEach(cell => {
      const cellRect = getRelativeRect(
          cell.domNode.getBoundingClientRect(),
          editorWrapper
      )

      if (
          cellRect.x + ERROR_LIMIT > compareRect.x &&
          cellRect.x1 - ERROR_LIMIT < compareRect.x1
      ) {
        removedCells.push(cell)
      } else if (
          cellRect.x < compareRect.x + ERROR_LIMIT &&
          cellRect.x1 > compareRect.x1 - ERROR_LIMIT
      ) {
        modifiedCells.push(cell)
      }
    })

    if (removedCells.length === tableCells.length) {
      this.tableDestroy()
      return true
    }

    // remove the matches column tool cell
    delIndexes.forEach((delIndex) => {
      this.colGroup().children.at(delIndexes[0]).remove()
    })

    removedCells.forEach(cell => {
      cell.remove()
    })

    modifiedCells.forEach(cell => {
      const cellColspan = parseInt(cell.formats().colspan, 10)
      const cellWidth = parseInt(cell.formats().width, 10)
      cell.format('colspan', cellColspan - delIndexes.length)
    })

    this.updateTableWidth()
  }

  deleteRow(compareRect, editorWrapper) {
    const [body] = this.descendants(TableBody)
    if (body == null || body.children.head == null) return

    const tableCells = this.descendants(TableCell)
    const tableRows = this.descendants(TableRow)
    const removedCells = []  // cells to be removed
    const modifiedCells = [] // cells to be modified
    const fallCells = []     // cells to fall into next row

    // compute rows to remove
    // bugfix: #21 There will be a empty tr left if delete the last row of a table
    const removedRows = tableRows.filter(row => {
      const rowRect = getRelativeRect(
          row.domNode.getBoundingClientRect(),
          editorWrapper
      )

      return rowRect.y > compareRect.y - ERROR_LIMIT &&
          rowRect.y1 < compareRect.y1 + ERROR_LIMIT
    })

    tableCells.forEach(cell => {
      const cellRect = getRelativeRect(
          cell.domNode.getBoundingClientRect(),
          editorWrapper
      )

      if (
          cellRect.y > compareRect.y - ERROR_LIMIT &&
          cellRect.y1 < compareRect.y1 + ERROR_LIMIT
      ) {
        removedCells.push(cell)
      } else if (
          cellRect.y < compareRect.y + ERROR_LIMIT &&
          cellRect.y1 > compareRect.y1 - ERROR_LIMIT
      ) {
        modifiedCells.push(cell)

        if (Math.abs(cellRect.y - compareRect.y) < ERROR_LIMIT) {
          fallCells.push(cell)
        }
      }
    })

    if (removedCells.length === tableCells.length) {
      this.tableDestroy()
      return
    }

    // compute length of removed rows
    const removedRowsLength = this.rows().reduce((sum, row) => {
      let rowRect  = getRelativeRect(
          row.domNode.getBoundingClientRect(),
          editorWrapper
      )

      if (
          rowRect.y > compareRect.y - ERROR_LIMIT &&
          rowRect.y1 < compareRect.y1 + ERROR_LIMIT
      ) {
        sum += 1
      }
      return sum
    }, 0)

    // it must excute before the table layout changed with other operation
    fallCells.forEach(cell => {
      const cellRect = getRelativeRect(
          cell.domNode.getBoundingClientRect(),
          editorWrapper
      )
      const nextRow = cell.parent.next
      const cellsInNextRow = nextRow.children

      const refCell = cellsInNextRow.reduce((ref, compareCell) => {
        const compareRect = getRelativeRect(
            compareCell.domNode.getBoundingClientRect(),
            editorWrapper
        )
        if (Math.abs(cellRect.x1 - compareRect.x) < ERROR_LIMIT) {
          ref = compareCell
        }
        return ref
      }, null)

      nextRow.insertBefore(cell, refCell)
      cell.format('row', nextRow.formats().row)
    })

    removedCells.forEach(cell => {
      cell.remove()
    })

    modifiedCells.forEach(cell => {
      const cellRowspan = parseInt(cell.formats().rowspan, 10)
      cell.format("rowspan", cellRowspan - removedRowsLength)
    })

    // remove selected rows
    removedRows.forEach(row => row.remove())
  }

  tableDestroy() {
    const quill = Quill.find(this.scroll.domNode.parentNode)
    const tableModule = quill.getModule("table-plus")
    this.remove()
    tableModule.hideTableTools()
    quill.update(Quill.sources.USER)
  }

  insertCell(tableRow, ref) {
    const id = cellId()
    const rId = tableRow.formats().row
    const tableCell = this.scroll.create(
        TableCell.blotName,
        Object.assign({}, CELL_DEFAULT, {
          row: rId
        })
    )
    const cellLine = this.scroll.create(TableCellLine.blotName, {
      row: rId,
      cell: id
    })
    tableCell.appendChild(cellLine)

    if (ref) {
      tableRow.insertBefore(tableCell, ref)
    } else {
      tableRow.appendChild(tableCell)
    }
  }

  insertColumn(compareRect, colIndex, isRight = true, editorWrapper) {
    const [body] = this.descendants(TableBody)
    const [tableColGroup] = this.descendants(TableColGroup)
    const tableCols = this.descendants(TableCol)
    let addAsideCells = []
    let modifiedCells = []
    let affectedCells = []

    if (body == null || body.children.head == null) return
    const tableCells = this.descendants(TableCell)
    tableCells.forEach(cell => {
      const cellRect = getRelativeRect(
          cell.domNode.getBoundingClientRect(),
          editorWrapper
      )

      if (isRight) {
        if (Math.abs(cellRect.x1 - compareRect.x1) < ERROR_LIMIT) {
          // the right of selected boundary equal to the right of table cell,
          // add a new table cell right aside this table cell
          addAsideCells.push(cell)
        } else if (
            compareRect.x1 - cellRect.x > ERROR_LIMIT &&
            compareRect.x1 - cellRect.x1 < -ERROR_LIMIT
        ) {
          // the right of selected boundary is inside this table cell
          // colspan of this table cell will increase 1
          modifiedCells.push(cell)
        }
      } else {
        if (Math.abs(cellRect.x - compareRect.x) < ERROR_LIMIT) {
          // left of selected boundary equal to left of table cell,
          // add a new table cell left aside this table cell
          addAsideCells.push(cell)
        } else if (
            compareRect.x - cellRect.x > ERROR_LIMIT &&
            compareRect.x - cellRect.x1 < -ERROR_LIMIT
        ) {
          // the left of selected boundary is inside this table cell
          // colspan of this table cell will increase 1
          modifiedCells.push(cell)
        }
      }
    })

    addAsideCells.forEach(cell => {
      const ref = isRight ? cell.next : cell
      const id = cellId()
      const tableRow = cell.parent
      const rId = tableRow.formats().row
      const cellFormats = cell.formats()
      const tableCell = this.scroll.create(
          TableCell.blotName,
          Object.assign({}, CELL_DEFAULT, {
            row: rId,
            rowspan: cellFormats.rowspan
          })
      )
      const cellLine = this.scroll.create(TableCellLine.blotName, {
        row: rId,
        cell: id,
        rowspan: cellFormats.rowspan
      })
      tableCell.appendChild(cellLine)

      if (ref) {
        tableRow.insertBefore(tableCell, ref)
      } else {
        tableRow.appendChild(tableCell)
      }
      affectedCells.push(tableCell)
    })

    // insert new tableCol
    const tableCol = this.scroll.create(TableCol.blotName, true)
    let colRef = isRight ? tableCols[colIndex].next : tableCols[colIndex]
    if (colRef) {
      tableColGroup.insertBefore(tableCol, colRef)
    } else {
      tableColGroup.appendChild(tableCol)
    }

    modifiedCells.forEach(cell => {
      const cellColspan = cell.formats().colspan
      cell.format('colspan', parseInt(cellColspan, 10) + 1)
      affectedCells.push(cell)
    })

    affectedCells.sort((cellA, cellB) => {
      let y1 = cellA.domNode.getBoundingClientRect().y
      let y2 = cellB.domNode.getBoundingClientRect().y
      return y1 - y2
    })

    this.updateTableWidth()
    return affectedCells
  }

  insertRow(compareRect, isDown, editorWrapper) {
    const [body] = this.descendants(TableBody)
    if (body == null || body.children.head == null) return

    const tableCells = this.descendants(TableCell)
    const rId = rowId()
    const newRow = this.scroll.create(TableRow.blotName, {
      row: rId
    })
    let addBelowCells = []
    let modifiedCells = []
    let affectedCells = []

    tableCells.forEach(cell => {
      const cellRect = getRelativeRect(
          cell.domNode.getBoundingClientRect(),
          editorWrapper
      )

      if (isDown) {
        if (Math.abs(cellRect.y1 - compareRect.y1) < ERROR_LIMIT) {
          addBelowCells.push(cell)
        } else if (
            compareRect.y1 - cellRect.y > ERROR_LIMIT &&
            compareRect.y1 - cellRect.y1 < -ERROR_LIMIT
        ) {
          modifiedCells.push(cell)
        }
      } else {
        if (Math.abs(cellRect.y - compareRect.y) < ERROR_LIMIT) {
          addBelowCells.push(cell)
        } else if (
            compareRect.y - cellRect.y > ERROR_LIMIT &&
            compareRect.y - cellRect.y1 < -ERROR_LIMIT
        ) {
          modifiedCells.push(cell)
        }
      }
    })

    // ordered table cells with rect.x, fix error for inserting
    // new table cell in complicated table with wrong order.
    const sortFunc = (cellA, cellB) => {
      let x1 = cellA.domNode.getBoundingClientRect().x
      let x2 = cellB.domNode.getBoundingClientRect().x
      return x1 - x2
    }
    addBelowCells.sort(sortFunc)

    addBelowCells.forEach(cell => {
      const cId = cellId()
      const cellFormats = cell.formats()

      const tableCell = this.scroll.create(TableCell.blotName, Object.assign(
          {}, CELL_DEFAULT, { row: rId, colspan: cellFormats.colspan }
      ))
      const cellLine = this.scroll.create(TableCellLine.blotName, {
        row: rId,
        cell: cId,
        colspan: cellFormats.colspan
      })
      const empty = this.scroll.create(Break.blotName)
      cellLine.appendChild(empty)
      tableCell.appendChild(cellLine)
      newRow.appendChild(tableCell)
      affectedCells.push(tableCell)
    })

    modifiedCells.forEach(cell => {
      const cellRowspan = parseInt(cell.formats().rowspan, 10)
      cell.format("rowspan", cellRowspan + 1)
      affectedCells.push(cell)
    })

    const refRow = this.rows().find(row => {
      let rowRect = getRelativeRect(
          row.domNode.getBoundingClientRect(),
          editorWrapper
      )
      if (isDown) {
        return Math.abs(rowRect.y - compareRect.y - compareRect.height) < ERROR_LIMIT
      } else {
        return Math.abs(rowRect.y - compareRect.y) < ERROR_LIMIT
      }
    })
    body.insertBefore(newRow, refRow)

    // reordering affectedCells
    affectedCells.sort(sortFunc)
    return affectedCells
  }

  mergeCells (compareRect, mergingCells, rowspan, colspan, editorWrapper) {
    const mergedCell = mergingCells.reduce((result, tableCell, index) => {
      if (index !== 0) {
        result && tableCell.moveChildren(result)
        tableCell.remove()
      } else {
        tableCell.format('colspan', colspan)
        tableCell.format('rowspan', rowspan)
        result = tableCell
      }

      return result
    }, null)

    let rowId = mergedCell.domNode.getAttribute('data-row')
    let cellId = mergedCell.children.head.domNode.getAttribute('data-cell')
    mergedCell.children.forEach(cellLine => {
      cellLine.format('cell', cellId)
      cellLine.format('row', rowId)
      cellLine.format('colspan', colspan)
      cellLine.format('rowspan', rowspan)
    })

    return mergedCell
  }

  unmergeCells (unmergingCells, editorWrapper) {
    let cellFormats = {}
    let cellRowspan = 1
    let cellColspan = 1

    unmergingCells.forEach(tableCell => {
      cellFormats = tableCell.formats()
      cellRowspan = cellFormats.rowspan
      cellColspan = cellFormats.colspan

      if (cellColspan > 1) {
        let ref = tableCell.next
        let row = tableCell.row()
        tableCell.format('colspan', 1)
        for (let i = cellColspan; i > 1; i--) {
          this.insertCell(row, ref)
        }
      }

      if (cellRowspan > 1) {
        let i = cellRowspan
        let nextRow = tableCell.row().next
        while (i > 1) {
          let refInNextRow = nextRow.children
              .reduce((result, cell) => {
                let compareRect = getRelativeRect(
                    tableCell.domNode.getBoundingClientRect(),
                    editorWrapper
                )
                let cellRect = getRelativeRect(
                    cell.domNode.getBoundingClientRect(),
                    editorWrapper
                )
                if (Math.abs(compareRect.x1 - cellRect.x) < ERROR_LIMIT) {
                  result = cell
                }
                return result
              }, null)

          for (let i = cellColspan; i > 0; i--) {
            this.insertCell(nextRow, refInNextRow)
          }

          i -= 1
          nextRow = nextRow.next
        }

        tableCell.format('rowspan', 1)
      }
    })
  }

  rows() {
    const body = this.children.tail
    if (body == null) return []
    return body.children.map(row => row)
  }
}
TableContainer.blotName = "table-container"
TableContainer.className = "quill-table-plus"
TableContainer.tagName = "TABLE"

class TableCaption extends Block {
  static create(value) {
    const node = super.create();
    node.innerText = value.caption || '테이블 캡션을 입력해주세요.';
    return node;
  }

  static formats(domNode) {
    return {
      caption: domNode.innerText,
    };
  }

  format(name, value) {
    if (name === 'caption') {
      this.domNode.innerText = value || '테이블 캡션을 입력해주세요.';
    } else {
      super.format(name, value);
    }
  }
}
TableCaption.blotName = 'table-caption';
TableCaption.className = 'table-caption';
TableCaption.tagName = 'caption';

class TableViewWrapper extends Container {
  constructor (scroll, domNode) {
    super(scroll, domNode)
    const quill = Quill.find(scroll.domNode.parentNode)
    domNode.addEventListener('scroll', (e) => {
      const tableModule = quill.getModule('table-plus')
      if (tableModule.columnTool) {
        tableModule.columnTool.domNode.scrollLeft = e.target.scrollLeft
      }

      if (tableModule.tableSelection &&
          tableModule.tableSelection.selectedTds.length > 0) {
        tableModule.tableSelection.repositionHelpLines()
      }
    }, false)
  }

  table () {
    return this.children.head
  }
}
TableViewWrapper.blotName = "table-view"
TableViewWrapper.className = "quill-table-plus-wrapper"
TableViewWrapper.tagName = "DIV"

TableViewWrapper.allowedChildren = [TableContainer]
TableContainer.requiredContainer = TableViewWrapper

TableContainer.allowedChildren = [TableBody, TableColGroup, TableCaption]
TableBody.requiredContainer = TableContainer
TableCaption.requiredContainer = TableContainer

TableBody.allowedChildren = [TableRow]
TableRow.requiredContainer = TableBody

TableRow.allowedChildren = [TableCell]
TableCell.requiredContainer = TableRow

TableCell.allowedChildren = [TableCellLine, Header]
TableCellLine.requiredContainer = TableCell

TableColGroup.allowedChildren = [TableCol]
TableColGroup.requiredContainer = TableContainer

TableCol.requiredContainer = TableColGroup

function rowId() {
  const id = Math.random()
      .toString(36)
      .slice(2, 6)
  return `row-${id}`
}

function cellId() {
  const id = Math.random()
      .toString(36)
      .slice(2, 6)
  return `cell-${id}`
}

export {
  // blots
  TableCol,
  TableColGroup,
  TableCellLine,
  TableCell,
  TableRow,
  TableBody,
  TableContainer,
  TableViewWrapper,
  TableCaption,

  // identity getters
  rowId,
  cellId,

  // attributes
  CELL_IDENTITY_KEYS,
  CELL_ATTRIBUTES
}
