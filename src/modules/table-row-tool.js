import Quill from 'quill';
import { css } from '../utils';

const ROW_TOOL_WIDTH = 12;
const ROW_TOOL_CELL_WIDTH = 12;

export default class TableRowTool {
    constructor(table, quill, options) {
        if (!table) return null;
        this.table = table;
        this.quill = quill;
        this.options = options;
        this.domNode = null;

        this.initRowTool();
    }

    initRowTool() {
        const parent = this.quill.root.parentNode;
        const tableRect = this.table.getBoundingClientRect();
        const containerRect = parent.getBoundingClientRect();
        const tableViewRect = this.table.parentNode.getBoundingClientRect();

        this.domNode = document.createElement('div');
        this.domNode.classList.add('qlbt-row-tool');
        this.updateToolRows();
        parent.appendChild(this.domNode);

        css(this.domNode, {
            opacity: 0,
            width: `${ROW_TOOL_WIDTH}px`,
            height: `${tableViewRect.height}px`,
            left: `${tableViewRect.left - ROW_TOOL_WIDTH - 5}px`,
            top: `${tableViewRect.top - containerRect.top + parent.scrollTop}px`
        });
    }

    createToolRow() {
        const toolRow = document.createElement('div');
        toolRow.classList.add('qlbt-row-tool-row');
        const resizeHolder = document.createElement('div');
        resizeHolder.classList.add('qlbt-row-tool-row-holder');
        css(toolRow, {
            'width': `${ROW_TOOL_CELL_WIDTH}px`
        });
        toolRow.appendChild(resizeHolder);
        return toolRow;
    }

    updateToolRows() {
        const tableContainer = Quill.find(this.table);
        const tableRows = tableContainer.rows();
        let existRows = Array.from(this.domNode.querySelectorAll('.qlbt-row-tool-row'));

        for (let index = 0; index < Math.max(tableRows.length, existRows.length); index++) {
            let toolRow = null;
            if (!existRows[index]) {
                toolRow = this.createToolRow();
                this.domNode.appendChild(toolRow);
            } else if (existRows[index] && index >= tableRows.length) {
                existRows[index].remove();
            } else {
                toolRow = existRows[index];
            }
        }
    }

    destroy() {
        this.domNode.remove();
        return null;
    }
}
