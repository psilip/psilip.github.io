// main.js
(async function() {
  // Load and parse TTL
  const initialTtl = await fetch('demo.ttl').then(res => res.text());
  const prefixes = {};
  let store = new Map();
  let suppressChange = false;

  // Parse TTL into store and capture prefixes
  async function parseToStore(ttl, capturePrefixes=false) {
    const newStore = new Map();
    return new Promise((resolve, reject) => {
      const parser = new N3.Parser();
      parser.parse(ttl, (err, quad, _prefixes) => {
        if (err) return reject(err);
        if (_prefixes && capturePrefixes) Object.assign(prefixes, _prefixes);
        if (quad) {
          const subj = quad.subject.value;
          if (!newStore.has(subj)) newStore.set(subj, []);
          newStore.get(subj).push(quad);
        } else {
          store = newStore;
          resolve();
        }
      });
    });
  }
  await parseToStore(initialTtl, true);

  // CodeMirror for Turtle
  const editor = CodeMirror.fromTextArea(document.getElementById('turtle'), { mode:'turtle', lineNumbers:true });

  // Update Turtle pane (initial only)
  function updateTurtle() {
    const writer = new N3.Writer({ prefixes });
    store.forEach(quads => quads.forEach(q => writer.addQuad(q)));
    writer.end((err, result) => {
      suppressChange=true; editor.setValue(result); suppressChange=false;
    });
  }
  updateTurtle();

  // Extract timeline events (prov:startedAtTime, prov:generatedAtTime)
  function extractEvents() {
    const evs = [];
    store.forEach((quads, subj) => {
      quads.forEach(q => {
        if (q.predicate.value.endsWith('startedAtTime') || q.predicate.value.endsWith('generatedAtTime')) {
          evs.push({
            id: subj + '|' + q.predicate.value,
            subject: subj,
            time: new Date(q.object.value),
            label: subj.split('#').pop()
          });
        }
      });
    });
    return evs.sort((a,b)=>a.time - b.time);
  }

  // Build graph data including class nodes
  function buildData() {
    const instances = Array.from(store.keys());
    const classSet = new Set();
    const links = [];

    // instance nodes
    const nodes = instances.map(id=>({ id, type:'instance', title: store.get(id)
      .find(q=>q.predicate.value.endsWith('/title'))
      ?.object.value || id }));

    // type links and collect classes
    instances.forEach(id => {
      store.get(id).forEach(q=>{
        if (q.predicate.value.endsWith('#type') && q.object.termType==='NamedNode') {
          const cls = q.object.value;
          classSet.add(cls);
          links.push({ source:id, target:cls, rel:'type' });
        }
      });
    });
    // class nodes
    const classNodes = Array.from(classSet).map(id=>({ id, type:'class', title:id.split('#').pop() }));
    return { nodes: nodes.concat(classNodes), links };
  }

  // Initialize SVG graph
  const svgEl = document.getElementById('graph');
  const w = svgEl.clientWidth, h = svgEl.clientHeight;
  const svg = d3.select(svgEl).attr('width',w).attr('height',h).append('g');

  // Scales
  const color = d=>d.type==='class'?'classNode':'instance';

  let data = buildData();

  // Simulation
  const sim = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links).id(d=>d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(w/2,h/2))
    .force('collide', d3.forceCollide().radius(d=>Math.max(d.width||40,d.height||20)/2+10))
    .on('tick', ticked);

  let linkSel = svg.append('g').selectAll('.link'),
      nodeSel = svg.append('g').selectAll('.node');

  function renderGraph() {
    data = buildData();
    sim.nodes(data.nodes);
    sim.force('link').links(data.links);

    // links
    linkSel = linkSel.data(data.links, d=>d.source.id+'|'+d.target.id);
    linkSel.exit().remove();
    linkSel = linkSel.enter().append('line').attr('class','link').merge(linkSel);

    // nodes
    nodeSel = nodeSel.data(data.nodes, d=>d.id);
    nodeSel.exit().remove();
    const enter = nodeSel.enter().append('g').attr('class','node')
      .call(d3.drag().on('start',dragstart).on('drag',drag).on('end',dragend));

    enter.filter(d=>d.type==='instance')
      .append('rect').attr('class','instance').attr('rx',4).attr('ry',4);

    enter.filter(d=>d.type==='class')
      .append('circle').attr('class','classNode').attr('r',20);

    enter.append('text').text(d=>d.title).attr('dy','0.35em');

    nodeSel = enter.merge(nodeSel);

    // size rectangles
    nodeSel.each(function(d){
      const g=d3.select(this);
      const text=g.select('text');
      const bbox=text.node().getBBox();
      if(d.type==='instance'){
        const w=bbox.width+16,h=bbox.height+8;
        d.width=w; d.height=h;
        g.select('rect').attr('width',w).attr('height',h).attr('x',-w/2).attr('y',-h/2);
      }
    });

    sim.alpha(1).restart();
  }

  function ticked(){
    linkSel.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y)
           .attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
    nodeSel.attr('transform',d=>`translate(${d.x},${d.y})`);
  }

  function dragstart(e,d){ if(!e.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; }
  function drag(e,d){ d.fx=e.x; d.fy=e.y; }
  function dragend(e,d){ if(!e.active) sim.alphaTarget(0); d.fx=null; d.fy=null; }

  renderGraph();

  // Timeline
  const events = extractEvents();
  const margin = {top:10,right:20,bottom:20,left:20};
  const tw = 400 - margin.left - margin.right;
  const th = 150 - margin.top - margin.bottom;
  const tsvg = d3.select('#timeline').append('svg')
    .attr('width',400).attr('height',150)
    .append('g').attr('transform',`translate(${margin.left},${margin.top})`);
  const x = d3.scaleTime().domain(d3.extent(events,d=>d.time)).range([0,tw]);
  tsvg.append('g').attr('transform',`translate(0,${th})`).call(d3.axisBottom(x));
  const markers = tsvg.selectAll('.event').data(events).enter().append('g')
    .attr('class','event').attr('transform',d=>`translate(${x(d.time)},${th/2})`);
  markers.append('circle').attr('class','event-marker').attr('r',5);
  markers.append('text').attr('class','event-label').attr('y',-10).text(d=>d.label);

  // On click event, highlight corresponding node
  markers.on('click',d=>{
    nodeSel.selectAll('rect,circle').attr('stroke-width',1);
    nodeSel.filter(n=>n.id===d.subject)
      .select('rect, circle').attr('stroke-width',3);
  });

  // Handle manual Turtle edits
  editor.on('change',()=>{
    if(suppressChange) return;
    clearTimeout(this._t);
    this._t=setTimeout(async()=>{
      try{ await parseToStore(editor.getValue()); renderGraph(); }
      catch{} },500);
  });
})();
