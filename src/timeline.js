export class Timeline {
  constructor(selector, store) {
    this.svg = d3.select(selector)
      .append('svg')
      .attr('width', 400)
      .attr('height', 150);
    store.onUpdate(() => this.render(store.getEvents()));
  }

  render(events) {
    // Clear previous contents
    this.svg.selectAll('*').remove();

    const margin = { top: 10, right: 20, bottom: 20, left: 20 };
    const width = +this.svg.attr('width') - margin.left - margin.right;
    const height = +this.svg.attr('height') - margin.top - margin.bottom;

    const g = this.svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Time scale
    const x = d3.scaleTime()
      .domain(d3.extent(events, d => d.time))
      .range([0, width]);

    // Axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x));

    // Event markers
    const markers = g.selectAll('.event')
      .data(events)
      .enter().append('g')
        .attr('class', 'event')
        .attr('transform', d => `translate(${x(d.time)},${height / 2})`);

    markers.append('circle')
      .attr('class', 'event-marker')
      .attr('r', 5);

    markers.append('text')
      .attr('class', 'event-label')
      .attr('y', -10)
      .text(d => d.label);

    // Dispatch timelineClick with subject when clicked
    markers.on('click', (event, d) => {
      window.dispatchEvent(new CustomEvent('timelineClick', { detail: d.subject }));
    });
  }
}
