import QuillTablePlus from 'src/quill-table-plus.js'
// import table-plus styles file
import 'src/assets/quill-table-plus.scss'

Quill.register({
  'modules/table-plus': QuillTablePlus
}, true)

window.onload = () => {
  const quill = new Quill('#editor-wrapper', {
    theme: 'snow',
    modules: {
      table: false,
      'table-plus': {
        operationMenu: {
          items: {
            unmergeCells: {
              text: 'Another unmerge cells name'
            }
          },

          color: {
            colors: ['red', 'green', 'yellow', 'white', 'red', 'green', 'yellow', 'white']
          }
        }
      },
      keyboard: {
        bindings: QuillTablePlus.keyboardBindings
      }
    }
  })

  let tableModule = quill.getModule('table-plus')
  document.body.querySelector('#insert-table')
    .onclick = () => {
      tableModule.insertTable(3, 3)
    }

  document.body.querySelector('#get-table')
    .onclick = () => {
      console.log(tableModule.getTable())
    }

  document.body.querySelector('#get-contents')
    .onclick = () => {
      console.log(quill.getContents())
    }
}
