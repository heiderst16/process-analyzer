/*
  Part of this code was used from the following projects:
  bpmn-js:
  https://github.com/bpmn-io/bpmn-js-examples/tree/master/modeler
  bpmn-engine:
  https://github.com/paed01/bpmn-engine
*/

import $ from 'jquery';

//import BpmnModeler from 'bpmn-js/lib/Modeler';

import BpmnViewer from 'bpmn-js/lib/Viewer';

const { Engine } = require('bpmn-engine');
const BpmnModdle = require('bpmn-moddle').default;
const elements = require('bpmn-elements');
const { default: Serializer, TypeResolver } = require('moddle-context-serializer');


/**
 * 
 * MODDLE
 * 
 **/
//import BpmnModdle from 'bpmn-moddle';
//const moddle = new BpmnModdle();

// import diagramXML from '../resources/newDiagram.bpmn';

var container = $('#js-drop-zone');

/*var modeler = new BpmnModeler({
  container: '#js-canvas'
});*/

var viewer = new BpmnViewer({
  container: $('#js-canvas'),
  //height: 600
});

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
   * BPMN-ENGINE
   * Notes: The Startevent of the BPMN-Process has to have the id "start"
   * 
   */
  (async function IIFE() {
    const moddleContext = await (new BpmnModdle({
      camunda: require('camunda-bpmn-moddle/resources/camunda.json'),
    })).fromXML(xml);

    const elementRegistry = viewer.get('elementRegistry');
    //console.log("elementRegistry:");
    //console.log(elementRegistry);
    const businessElements = elementRegistry._elements;
    console.log("businessElements:");
    console.log(businessElements);

    const sourceContext = Serializer(moddleContext, TypeResolver(elements));

    const engine = Engine({
      sourceContext,
    });

    const [definition] = await engine.getDefinitions();

    const shakenStarts = definition.shake();
    //console.log("shakenStarts:");
    //console.log(shakenStarts);

    //console.log(shakenStarts.start);
    const shakenStartsSequences = shakenStarts.start.map(e => e.sequence);
    console.log("shakenstartsSequences:");
    console.log(shakenStartsSequences);
    const shakenStartsFiltered = shakenStartsSequences.map(e => e.filter(e => !e.type.includes("EndEvent") && !e.type.includes("StartEvent") && !e.type.includes("Task") && !e.type.includes("SequenceFlow")));
    console.log("shakenStartsFiltered:");
    console.log(shakenStartsFiltered);

    const convertedElements = shakenStartsFiltered.map(m => m.map(e => convertElements(e)));
    console.log("convertedElements:");
    console.log(convertedElements);

    const pairedElements = pairElements(convertedElements);
    console.log("pairedElements:");
    console.log(pairedElements);


    function convertElements(e) {
      const fullElement = businessElements[e.id];
      const incoming = fullElement.element.incoming.length;
      const outgoing = fullElement.element.outgoing.length;

      if (incoming == 1) {
        return ({ id: e.id, type: e.type, sm: "split", outgoing: outgoing, uncertainty: 1, paired: false, pairid:"" });
      } else {
        return ({ id: e.id, type: e.type, sm: "merge", incoming: incoming, uncertainty: 1, paired: false, pairid:"" });
      }
    };

    function pairElements(listsOfElements) {
      var pairedList = listsOfElements;
      var unpairedElements = 1;
      var counter = 0;
      while (unpairedElements > 0 && counter < 1000) { //counter als absicherung damit kein endlosloop entsteht

        var filteredUnpairedList = pairedList.map(e => e.filter(m => m.paired != true));
        for (let i = 0; i < filteredUnpairedList.length; i++) {
          const listOfElements = filteredUnpairedList[i];
          for (let j = 0; j < listOfElements.length; j++) {
            if (checkIfSequence(filteredUnpairedList, listOfElements[j], listOfElements[j + 1])) {
              pairedList = setAttributes(pairedList, listOfElements[j], listOfElements[j + 1]);
            }
          }
        }

        unpairedElements = 0;
        for (let i = 0; i < filteredUnpairedList.length; i++) {
          unpairedElements += filteredUnpairedList[i].length;
          //console.log(filteredUnpairedList[i].length);
        }
        counter = counter + 1;
        console.log(counter);
      }
      return (pairedList);
    }

    function checkIfSequence(unpairedElements, a, b) {
      var check = 0;
      if (b != undefined) {
        for (let i = 0; i < unpairedElements.length; i++) {
          const elements = unpairedElements[i];

          for (let j = 0; j < elements.length; j++) {
            //console.log(elements);
            if ((elements[j].id == a.id && elements[j + 1].id != b.id) || !(a.sm == "split" && b.sm == "merge")) {
              check += 1;
            }
          }
        }
      } else if (a.sm != "split" && b == undefined) {
        check = 1;
      }
      if (check == 0) {
        return (true);
      } else {
        return (false);
      }
    }

    function setAttributes(elementArray, elem1, elem2) {
      var id1 = elem1.id;
      var newElementArray = elementArray;
      if(elem2 != undefined){
        var id2 = elem2.id;
      }
      for (let i = 0; i < elementArray.length; i++) {
        for (let j = 0; j < elementArray[i].length; j++) {
          if(elem2 != undefined){
            if(elementArray[i][j].id == id1 || elementArray[i][j].id == id2) {
              newElementArray[i][j].paired = true;
              newElementArray[i][j].pairid = id1.concat(id2);
            }
          } else {
            if(elementArray[i][j].id == id1) {
              newElementArray[i][j].paired = true;
              newElementArray[i][j].pairid = id1;
            }
          }
        }
      }
      return newElementArray;
    }

  })();
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

