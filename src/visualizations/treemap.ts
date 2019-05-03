import * as d3 from 'd3'
import { formatType, handleErrors } from '../common/utils'
import './treemap.scss'

import {
  Cell,
  Link,
  Row,
  Looker,
  LookerChartUtils,
  VisualizationDefinition
} from '../common/types'

// Global values provided via the API
declare var looker: Looker
declare var LookerCharts: LookerChartUtils

var wholepop,hoverpop,poparrow,toparrow;

function popMove(evt) {
	if (wholepop != undefined) {
		
		var poptop,popleft;
		var viswidth = document.getElementById('vis').offsetWidth;
		
		poptop = evt.clientY - 130;
		popleft = evt.clientX - 78;
		
		if (popleft < 0) {popleft = 0};
		if ((popleft + 173) > viswidth) {
			popleft = viswidth - 173;
		}
		if (poptop < 0) {
			poptop = poptop + 150;
			toparrow.style.display = 'block';
			poparrow.style.display = 'none';
		} else {
			toparrow.style.display = 'none';
			poparrow.style.display = 'block';
		}
		
		wholepop.style.top  = (poptop).toString() + 'px';
		wholepop.style.left  = (popleft).toString() + 'px';
	}
}

document.onmousemove = popMove;

interface TreemapVisualization extends VisualizationDefinition {
  svg?: d3.Selection<SVGElement, {}, any, any>,
}

// recursively create children array
function descend(obj: any, depth: number = 0) {
  const arr: any[] = []
  for (const k in obj) {
    if (k === '__data') {
      continue
    }
    const child: any = {
      name: k,
      depth,
      children: descend(obj[k], depth + 1)
    }
    if ('__data' in obj[k]) {
      child.data = obj[k].__data
    }
    arr.push(child)
  }
  return arr
}

function burrow(table: Row[]) {
  // create nested object
  const obj: any = {}

  table.forEach((row: Row) => {
    // start at root
    let layer = obj

    // create children as nested objects
    row.taxonomy.value.forEach((key: any) => {
      layer[key] = key in layer ? layer[key] : {}
      layer = layer[key]
    })
    layer.__data = row
  })

  // use descend to create nested children arrays
  return {
    name: 'root',
    children: descend(obj, 1),
    depth: 0
  }
}

const vis: TreemapVisualization = {
  id: 'treemap',
  label: 'Treemap',
  options: {
    color_range: {
      type: 'array',
      label: 'Color Range',
      display: 'colors',
      default: ['#dd3333', '#80ce5d', '#f78131', '#369dc1', '#c572d3', '#36c1b3', '#b57052', '#ed69af']
    }
  },
  // Set up the initial state of the visualization
  create: function (element, config) {
    this.svg = d3.select(element).append('svg');
	
	wholepop = document.createElement('div');
	wholepop.className = 'treemap_whole_pop';
	hoverpop = document.createElement('div');
	hoverpop.className = 'treemap_hover_pop';
	poparrow = document.createElement('div');
	poparrow.className = 'treemap_pop_arrow';
	toparrow = document.createElement('div');
	toparrow.className = 'treemap_top_arrow';
	
	wholepop.appendChild(toparrow);
	wholepop.appendChild(hoverpop);
	wholepop.appendChild(poparrow);
	
	//console.log(window.parent);
	element.appendChild(wholepop);
  },
  // Render in response to the data or settings changing
  update: function (data, element, config, queryResponse) {
    if (!handleErrors(this, queryResponse, {
      min_pivots: 0, max_pivots: 0,
      min_dimensions: 1, max_dimensions: undefined,
      min_measures: 1, max_measures: 1
    })) return

    const width = element.clientWidth
    const height = element.clientHeight

    const dimensions = queryResponse.fields.dimension_like
    const measure = queryResponse.fields.measure_like[0]

    const format = formatType(measure.value_format) || ((s: any): string => s.toString())
	
	if (config.color_range == undefined) {config.color_range = ["#5245ed", "#ed6168", "#1ea8df", "#353b49", "#49cec1", "#b3a0dd", "#db7f2a", "#706080", "#a2dcf3", "#776fdf", "#e9b404", "#635189"];}
	
    const colorScale: d3.ScaleOrdinal<string, null> = d3.scaleOrdinal()
    const color = colorScale.range(config.color_range)

    data.forEach((row: Row) => {
      row.taxonomy = {
        value: dimensions.map((dimension) => row[dimension.name].value)
      }
    })

    const treemap = d3.treemap()
      .size([width, height - 0])
      .tile(d3.treemapSquarify.ratio(1))
      .paddingOuter(1)
      .paddingTop((d) => {
        return d.depth === 1 ? 16 : 0
      })
      .paddingInner(1)
      .round(true)

    const svg = this.svg!
      .html(' ')
      .attr('width', '100%')
      .attr('height', '100%')
      .append('g')
      .attr('transform', 'translate(0,0)')

    const root = d3.hierarchy(burrow(data)).sum((d: any) => {
      return 'data' in d ? d.data[measure.name].value : 0
    })
    treemap(root)

    const cell = svg.selectAll('.node')
      .data(root.descendants())
      .enter().append('g')
      .attr('transform', (d: any) => 'translate(' + d.x0 + ',' + d.y0 + ')')
      .attr('class', (d, i) => 'node depth-' + d.depth)
      .style('stroke-width', 1.5)
      .style('cursor', 'pointer')
	  .on('click', function (this: any, d: Cell) {
		const coords = d3.mouse(this);
		
		const xOffset = parseInt(this.getAttribute('transform').split(',')[0].replace('translate(',''));
		const yOffset = parseInt(this.getAttribute('transform').split(',')[1].replace(')',''));
		const event: object = { pageX: coords[0] + xOffset, pageY: coords[1] +yOffset }
		
		if (d.data.data[dimensions[0].name].hasOwnProperty('links')) {		
			d.data.data[dimensions[0].name].links.forEach((link) => {
				link.url = link.url + '&vis_config=' + encodeURIComponent(JSON.stringify({type:'treemap_jt'}));
			})
		}
		
		LookerCharts.Utils.openDrillMenu({
			links: d.data.data[dimensions[0].name].links,
			event: event
		});
		
	  })
      .on('mouseenter', (d: any) => {
        const ancestors = d.ancestors()
		
		hoverpop.innerHTML = ancestors.map((p: any) => p.data.name)
            .slice(0, -1)
            .reverse()
            .join('-') + ': ' + format(d.value);
		wholepop.style.display = 'block';
	
        svg.selectAll('g.node rect')
          .style('stroke', null)
          .filter((p: any) => ancestors.indexOf(p) > -1)
          .style('stroke', '#fff')
      })
      .on('mouseleave', (d) => {
        svg.selectAll('g.node rect')
          .style('stroke', (d) => {
            return null
          })
		 hoverpop.innerHTML = '';
		 wholepop.style.display = 'none';
      })

    cell.append('rect')
      .attr('id', (d, i) => 'rect-' + i)
      .attr('width', (d: any) => d.x1 - d.x0)
      .attr('height', (d: any) => d.y1 - d.y0)
      .style('fill', (d) => {
        if (d.depth === 0) return 'none'
        const ancestor: string = d.ancestors().map((p) => p.data.name).slice(-2, -1)[0]
        const colors: any[] = [color(ancestor), '#ddd']
        const scale = d3.scaleLinear()
          .domain([1, 6.5])
          .range(colors)
        return scale(d.depth)
      })
	  

    cell.append('clipPath')
      .attr('id', (d, i) => 'clip-' + i)
      .append('use')
      .attr('xlink:href', (d, i) => '#rect-' + i)

    cell.append('text')
      .style('opacity', (d) => {
        if (d.depth === 1) return 1
        return 0
      })
      .attr('clip-path', (d, i) => 'url(#clip-' + i + ')')
      .attr('y', (d) => {
        return d.depth === 1 ? '13' : '10'
      })
      .attr('x', 2)
      .style('font-family', 'Helvetica, Arial, sans-serif')
      .style('fill', 'white')
      .style('font-size', (d) => {
        return d.depth === 1 ? '14px' : '10px'
      })
      .text((d) => d.data.name === 'root' ? '' : d.data.name)

  }
}

looker.plugins.visualizations.add(vis)