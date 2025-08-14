// src/editor.js

export class TurtleEditor {
  constructor(selector, store) {
    this.store = store;
    this.editor = CodeMirror.fromTextArea(
      document.querySelector(selector),
      {
        mode: 'turtle',
        lineNumbers: true,
        gutters: ['CodeMirror-lint-markers'],
        lint: true,  // optional: enable linting if desired
      }
    );

    // Debounced change handler
    this.debounceTimeout = null;
    this.suppress = false;

    this.editor.on('change', () => {
      if (this.suppress) return;
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = setTimeout(async () => {
        const text = this.editor.getValue();
        try {
          await this.store.parse(text, false);
          // Highlight parse success, e.g., clear gutter markers
        } catch (e) {
          console.warn('Parse error in TTL:', e);
          // Optionally, mark error in gutter or show banner
        }
      }, 500);
    });

    // Update editor content on store changes without re-triggering change event
    this.store.onUpdate(() => {
      this.suppress = true;
      const writer = new N3.Writer({ prefixes: this.store.prefixes });
      this.store.store.forEach(quads => quads.forEach(q => writer.addQuad(q)));
      writer.end((err, result) => {
        this.editor.setValue(result);
        this.suppress = false;
      });
    });
  }
}
