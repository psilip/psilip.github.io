import { Store } from './store.js';
import { GraphView } from './graph.js';
import { Timeline } from './timeline.js';
import { TurtleEditor } from './editor.js';
(async () => {
  const ttl = await fetch('../demo.ttl').then(r => r.text());
  const store = new Store(ttl);
  new GraphView('#graph', store);
  new Timeline('#timeline', store);
  new TurtleEditor('#turtle', store);
})();
