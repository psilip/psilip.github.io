// src/graph.js

export class GraphView {
  constructor(selector, store) {
    this.store = store;
    this.svg = d3.select(selector).append('g');
    this.linkSel = this.svg.append('g').selectAll('.link');
    this.nodeSel = this.svg.append('g').selectAll('.node');

    this.sim = d3.forceSimulation()
      .force('link', d3.forceLink().id(d => d.id).strength(0.5))
      .force('charge', d3.forceManyBody().strength(200))
      .force('center', d3.forceCenter().strength(0.5))
      //.force('collide', d3.forceCollide().radius(d => {d.width + 150; console.log(d.width)}).strength(1));
      ;
    store.onUpdate(() => this.render(store.getNodesAndLinks()));
  }

  render({ nodes, links }) {
    const svgEl = this.svg.node().ownerSVGElement;
    const width = svgEl.clientWidth;
    const height = svgEl.clientHeight;

    // Apply gentle vertical-bias: classes toward top, instances toward bottom
    this.sim.force('y', d3.forceY().y(d => d.type === 'class'
      ? height * (9-8)/20
      : height * (9+8)/20
    ).strength(0.1));

    this.sim.force('center').x(width/2).y(height/2);
    this.sim.nodes(nodes);
    this.sim.force('link').links(links);

    // links
    this.linkSel = this.linkSel.data(links, d => d.source.id + '|' + d.target.id);
    this.linkSel.exit().remove();
    this.linkSel = this.linkSel.enter()
      .append('line').attr('class', 'link')
      .merge(this.linkSel);

    // nodes
    this.nodeSel = this.nodeSel.data(nodes, d => d.id);
    this.nodeSel.exit().remove();
    const entered = this.nodeSel.enter()
      .append('g')
      .attr('class', d => {
        const prefix = Object.keys(this.store.prefixes)
          .find(p => d.id.startsWith(this.store.prefixes[p])) || 'unknown';
        return `node ${d.type} prefix-${prefix}`;
      })
      .call(d3.drag()
        .on('start', (e, d) => this.dragstarted(e, d))
        .on('drag', (e, d) => this.dragged(e, d))
        .on('end', (e, d) => this.dragended(e, d))
      );

    entered.filter(d => d.type === 'instance')
      .append('rect').attr('class', 'instance');
    entered.filter(d => d.type === 'class')
      .append('ellipse').attr('class', 'classNode');
    entered.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em');

    this.nodeSel = entered.merge(this.nodeSel);

    // size
    this.nodeSel.select('text').text(d => d.title);
    this.nodeSel.each((d, i, nodesSel) => {
      const g = d3.select(nodesSel[i]);
      const text = g.select('text');
      const bbox = text.node().getBBox();
      const w = bbox.width + 16;
      const h = bbox.height + 8;
      if (d.type === 'instance') {
        d.width = w; d.height = h;
        g.select('rect')
          .attr('width', w)
          .attr('height', h)
          .attr('x', -w/2)
          .attr('y', -h/2);
      } else if (d.type === 'class') {
        d.width = w; d.height = h;
        g.select('ellipse')
          .attr('rx', w/2 + 4)
          .attr('ry', h/2 + 4);
      }
    });
    // Update collision force after sizing
    this.sim.force('collide', d3.forceCollide()
      .radius(d => Math.max(d.width || 0)/2)
      .strength(1)
    );

    this.sim.alpha(1).restart();
    this.sim.on('tick', () => {
      this.linkSel
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      this.nodeSel
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });
  }

  dragstarted(event, d) {
    if (!event.active) this.sim.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  }

  dragged(event, d) {
    d.fx = event.x; d.fy = event.y;
  }

  dragended(event, d) {
    if (!event.active) this.sim.alphaTarget(0);
    d.fx = null; d.fy = null;
  }
}
