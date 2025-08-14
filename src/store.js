// src/store.js

// Note: N3 is provided globally via <script> include; no import needed
export class Store {
  constructor(initialTTL) {
    this.prefixes = {};
    this.store = new Map();
    this.listeners = new Set();
    this.loadedNamespaces = new Set();
    // Parse initial TTL including prefixes
    this.parse(initialTTL, true);
  }

  // Parse TTL text into the store, capture prefixes optionally
  async parse(ttl, capturePrefixes = false) {
    const parser = new N3.Parser();
    const newStore = new Map();
    await new Promise((resolve, reject) => {
      parser.parse(ttl, (err, quad, prefixes) => {
        if (err) return reject(err);
        if (capturePrefixes && prefixes) Object.assign(this.prefixes, prefixes);
        if (quad) {
          const subj = quad.subject.value;
          if (!newStore.has(subj)) newStore.set(subj, []);
          newStore.get(subj).push(quad);
        } else {
          resolve();
        }
      });
    });
    this.store = newStore;
    this.emit();
  }

  // Subscribe to store updates
  onUpdate(fn) {
    this.listeners.add(fn);
  }

  // Notify all listeners of changes
  emit() {
    this.listeners.forEach(fn => fn());
  }

  // Build nodes and links (instances and owl:Classes)
  getNodesAndLinks() {
    const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
    const RDFS_SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';

    // Detect classes from type assertions or subclass relations
    const classSet = new Set();
    this.store.forEach((quads, subj) => {
      quads.forEach(q => {
        // If a subject is declared a class or is subclass
        if ((q.predicate.value === RDF_TYPE && q.object.value === OWL_CLASS) ||
            q.predicate.value === RDFS_SUBCLASS) {
          classSet.add(subj);
        }
        // Also mark referenced class IRIs as class nodes
        if (q.predicate.value === RDF_TYPE && q.object.termType === 'NamedNode') {
          classSet.add(q.object.value);
        }
      });
    });

    // Build node map for all subjects and classes
    const nodesMap = new Map();
    this.store.forEach((quads, subj) => {
      const titleQuad = quads.find(q => q.predicate.value.endsWith('/title'));
      nodesMap.set(subj, {
        id: subj,
        type: classSet.has(subj) ? 'class' : 'instance',
        title: titleQuad ? titleQuad.object.value : subj
      });
    });
    // Add class IRIs not present as subjects
    classSet.forEach(clsIRI => {
      if (!nodesMap.has(clsIRI)) {
        nodesMap.set(clsIRI, {
          id: clsIRI,
          type: 'class',
          title: clsIRI.split('#').pop()
        });
      }
    });

    // Build links: type links and other relations
    const links = [];
    this.store.forEach((quads, subj) => {
      quads.forEach(q => {
        if (q.predicate.value === RDF_TYPE && q.object.termType === 'NamedNode') {
          const cls = q.object.value;
          if (nodesMap.has(cls)) links.push({ source: subj, target: cls });
        } else if (q.object.termType === 'NamedNode' && nodesMap.has(q.object.value)) {
          links.push({ source: subj, target: q.object.value });
        }
      });
    });

    return { nodes: Array.from(nodesMap.values()), links };
  }

  // Extract timeline events (prov: timestamps)
  getEvents() {
    const evs = [];
    this.store.forEach((quads, subj) => {
      quads.forEach(q => {
        if (q.predicate.value.endsWith('startedAtTime') ||
            q.predicate.value.endsWith('generatedAtTime')) {
          evs.push({
            id: `${subj}|${q.predicate.value}`,
            subject: subj,
            time: new Date(q.object.value)
          });
        }
      });
    });
    return evs.sort((a, b) => a.time - b.time);
  }
}
