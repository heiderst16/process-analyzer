/*
  Part of this code was used from the following project:
  https://github.com/bpmn-io/bpmn-js-examples/tree/master/modeler
*/

import $ from 'jquery';

import BpmnModeler from 'bpmn-js/lib/Modeler';

import BpmnViewer from 'bpmn-js/lib/Viewer';


/**
 * 
 * moddleeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
 * 
 **/
import BpmnModdle from 'bpmn-moddle';
const moddle = new BpmnModdle();

// import diagramXML from '../resources/newDiagram.bpmn';

var container = $('#js-drop-zone');

/*var modeler = new BpmnModeler({
  container: '#js-canvas'
});*/

var viewer = new BpmnViewer({
  container: $('#js-canvas'),
  //height: 600
});

/*
function createNewDiagram() {
  openDiagram(diagramXML);
}*/

async function openDiagram(xml) {

  try {

    await viewer.importXML(xml);

    container
      .removeClass('with-error')
      .addClass('with-diagram');
  } catch (err) {

    container
      .removeClass('with-diagram')
      .addClass('with-error');

    container.find('.error pre').text(err.message);

    console.error(err);
  }

  /**
   * 
   * 
   * 
   * 
   **/
  /*
  var elementRegistry = viewer.get('elementRegistry');
  console.log(elementRegistry);
  var objects = elementRegistry.filter(p => p.businessObject.type == 'Task')

  //var sequenceFlowElement = elementRegistry.get('StartEvent_1');
  //var sequenceFlowElement = elementRegistry.get('Task_18csy74');
  //console.log(sequenceFlowElement.businessObject);
  //console.log(sequenceFlowElement.businessObject.outgoing[0].id);

  elementRegistry.forEach(element => {
    var out = sequenceFlowElement.businessObject.outgoing;
    console.log(out[0].id);
    console.log(sequenceFlowElement.businessObject.incoming[0].id);
    
    //var nextElements = elementRegistry.filter(p => p.businessObject.incoming[0].id == out[0].id);
    //console.log(nextElements);
    //var sequenceFlowElement = nextElements.first;
  });



  /*var sequenceFlow = sequenceFlowElement.businessObject;
  console.log(sequenceFlow);
  console.log(sequenceFlow.outgoing);
  console.log(sequenceFlow.incoming);
  const bpmnProcess = moddle.fromXML(xml);
  console.log(bpmnProcess);*/
}

function registerFileDrop(container, callback) {

  function handleFileSelect(e) {
    e.stopPropagation();
    e.preventDefault();

    var files = e.dataTransfer.files;

    var file = files[0];

    var reader = new FileReader();

    reader.onload = function (e) {

      var xml = e.target.result;

      callback(xml);
    };

    reader.readAsText(file);
  }

  function handleDragOver(e) {
    e.stopPropagation();
    e.preventDefault();

    e.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
  }

  container.get(0).addEventListener('dragover', handleDragOver, false);
  container.get(0).addEventListener('drop', handleFileSelect, false);

}


// file drag / drop ///////////////////////

// check file api availability
if (!window.FileList || !window.FileReader) {
  window.alert(
    'Looks like you use an older browser that does not support drag and drop. ' +
    'Try using Chrome, Firefox or the Internet Explorer > 10.');
} else {
  registerFileDrop(container, openDiagram);
}

// bootstrap diagram functions

$(function () {
  /*
  $('#js-create-diagram').click(function(e) {
    e.stopPropagation();
    e.preventDefault();

    createNewDiagram();
  });

  var downloadLink = $('#js-download-diagram');
  var downloadSvgLink = $('#js-download-svg');

  $('.buttons a').click(function(e) {
    if (!$(this).is('.active')) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  function setEncoded(link, name, data) {
    var encodedData = encodeURIComponent(data);

    if (data) {
      link.addClass('active').attr({
        'href': 'data:application/bpmn20-xml;charset=UTF-8,' + encodedData,
        'download': name
      });
    } else {
      link.removeClass('active');
    }
  }
  
  var exportArtifacts = debounce(async function() {

    try {

      const { svg } = await modeler.saveSVG();

      setEncoded(downloadSvgLink, 'diagram.svg', svg);
    } catch (err) {

      console.error('Error happened saving svg: ', err);
      setEncoded(downloadSvgLink, 'diagram.svg', null);
    }

    try {

      const { xml } = await modeler.saveXML({ format: true });
      setEncoded(downloadLink, 'diagram.bpmn', xml);
    } catch (err) {

      console.error('Error happened saving XML: ', err);
      setEncoded(downloadLink, 'diagram.bpmn', null);
    }
  }, 500);

  modeler.on('commandStack.changed', exportArtifacts);
  */
});



// helpers //////////////////////
/*
function debounce(fn, timeout) {

  var timer;

  return function() {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(fn, timeout);
  };
}*/
