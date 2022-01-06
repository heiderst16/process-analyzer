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
    //console.log("businessElements:");
    //console.log(businessElements);

    const sourceContext = Serializer(moddleContext, TypeResolver(elements));

    const engine = Engine({
      sourceContext,
    });

    const [definition] = await engine.getDefinitions();

    const shakenStarts = definition.shake();
    console.log("shakenStarts:");
    console.log(shakenStarts);

    //console.log(shakenStarts.start);
    const shakenStartsSequences = shakenStarts.start.map(e => e.sequence);
    //console.log("shakenstartsSequences:");
    //console.log(shakenStartsSequences);
    const shakenStartsFiltered = shakenStartsSequences.map(e => e.filter(e => !e.type.includes("EndEvent") && !e.type.includes("StartEvent") && !e.type.includes("Task") && !e.type.includes("SequenceFlow")));
    //console.log("shakenStartsFiltered:");
    //console.log(shakenStartsFiltered);

    const convertedElements = shakenStartsFiltered.map(m => m.map(e => convertElements(e)));
    //console.log("convertedElements:");
    //console.log(convertedElements);

    const pairedElements = pairElements(convertedElements);
    //console.log("pairedElements:");
    //console.log(pairedElements);

    const classifiedElements = classifyElements(pairedElements);
    console.log("classifiedElements:");
    console.log(classifiedElements);

    const uncertainty = calculateUncertainty(classifiedElements);
    changeLabel();

    function changeLabel() {
      let lbl = document.getElementById('calculatedUncertainty');
      lbl.innerText = "The uncertainty of the business process: " + uncertainty;
    }

    function convertElements(e) {
      const fullElement = businessElements[e.id];
      const incoming = fullElement.element.incoming.length;
      const outgoing = fullElement.element.outgoing.length;

      if (incoming == 1 && outgoing > 1) {
        return ({ id: e.id, type: e.type, sm: "split", outgoing: outgoing, uncertainty: 0, uncertaintyOfBranches: [], recordedBranches: [], removed: false, calculated: false, counter: 0, paired: false, pairid: "", isLoop: false, classification: "" });
      } else if (incoming > 1 && outgoing == 1) {
        return ({ id: e.id, type: e.type, sm: "merge", incoming: incoming, uncertainty: 0, uncertaintyOfBranches: [], recordedBranches: [], removed: false, calculated: false, counter: 0, paired: false, pairid: "", isLoop: false, classification: "" });
      }
    };

    function pairElements(listsOfElements) {
      var pairedList = listsOfElements;
      //var unpairedElements = 1;
      //var counter = 0;
      for (let x = 0; x < listsOfElements.length; x++) {
        //while (unpairedElements > 0 && counter < 1000) { //counter als absicherung damit kein endlosloop entsteht
        var filteredUnpairedList = pairedList.map(e => e.filter(m => m.paired != true));
        if (filteredUnpairedList.length >= 0) {
          for (let i = 0; i < filteredUnpairedList.length; i++) {
            const listOfElements = filteredUnpairedList[i];
            for (let j = 0; j < listOfElements.length; j++) {
              if (checkIfSequence(filteredUnpairedList, listOfElements[j], listOfElements[j + 1])) {
                pairedList = setAttributes(pairedList, listOfElements[j], listOfElements[j + 1]);
              }
            }
          }
          /*unpairedElements = 0;
          for (let i = 0; i < filteredUnpairedList.length; i++) {
            unpairedElements += filteredUnpairedList[i].length;
            //console.log(filteredUnpairedList[i].length);
          }
          counter = counter + 1;
          console.log(counter);*/
        }
      }
      const pairidArray = pairedList.map(m => m.map(e => e.pairid));
      const duplicates = pairidArray.map(e => e.filter((elem, index) => e.indexOf(elem) !== index));
      //console.log("duplicates:");
      //console.log(duplicates);
      var duplicatesConverted = [];
      for (let i = 0; i < duplicates.length; i++) {
        duplicatesConverted = duplicatesConverted.concat(duplicates[i]);
      }
      //console.log(duplicatesConverted);
      for (let i = 0; i < pairedList.length; i++) {
        for (let j = 0; j < pairedList[i].length; j++) {
          if (!duplicatesConverted.includes(pairedList[i][j].pairid)) {
            pairedList[i][j].pairid = "";
            pairedList[i][j].paired = false;
          }
        }
      }
      return (pairedList);
    }

    function checkIfSequence(unpairedElements, a, b) {
      var check = false;
      if (b != undefined) {
        for (let i = 0; i < unpairedElements.length; i++) {
          const elements = unpairedElements[i];

          for (let j = 0; j < elements.length - 1; j++) {
            //console.log(elements);
            if ((elements[j].id == a.id && elements[j + 1].id == b.id) && (a.sm == "split" && b.sm == "merge")) {
              check = true;
            }
          }
        }
      }
      return check;
    }

    function setAttributes(elementArray, elem1, elem2) {
      var id1 = elem1.id;
      var newElementArray = elementArray;
      if (elem2 != undefined) {
        var id2 = elem2.id;
      }
      for (let i = 0; i < elementArray.length; i++) {
        for (let j = 0; j < elementArray[i].length; j++) {
          if (elem2 != undefined) {
            if (elementArray[i][j].id == id1 || elementArray[i][j].id == id2) {
              newElementArray[i][j].paired = true;
              newElementArray[i][j].pairid = id1.concat("_").concat(id2);
            }
          } else {
            if (elementArray[i][j].id == id1) {
              newElementArray[i][j].paired = true;
              newElementArray[i][j].pairid = id1;
            }
          }
        }
      }
      return newElementArray;
    }

    function classifyElements(elemArray) {
      const idArray = elemArray.map(m => m.map(e => e.id));
      var toclassifyArray = elemArray;
      //console.log("idArray:");
      //console.log(idArray);
      const duplicates = idArray.map(e => e.filter((elem, index) => e.indexOf(elem) !== index));
      //console.log("duplicates:");
      //console.log(duplicates);
      var duplicatesConverted = [];
      for (let i = 0; i < duplicates.length; i++) {
        duplicatesConverted = duplicatesConverted.concat(duplicates[i]);
      }
      //console.log("duplicatesConverted:");
      //console.log(duplicatesConverted);
      for (let i = 0; i < toclassifyArray.length; i++) {
        for (let j = 0; j < toclassifyArray[i].length; j++) {
          if (duplicatesConverted.includes(toclassifyArray[i][j].id)) {
            toclassifyArray[i][j].isLoop = true;
            for (let x = 0; x < toclassifyArray.length; x++) {
              for (let y = 0; y < toclassifyArray[x].length; y++) {
                if (toclassifyArray[x][y].pairid == toclassifyArray[i][j].pairid) {
                  toclassifyArray[x][y].isLoop = true;
                }
              }
            }
          }
        }
      }
      for (let i = 0; i < toclassifyArray.length; i++) {
        for (let j = 0; j < toclassifyArray[i].length; j++) {
          const classifyElem = toclassifyArray[i][j];
          if (classifyElem.isLoop) {
            classifyElem.classification = "LOOP";
          } else if (classifyElem.type.includes("Exclusive")) {
            classifyElem.classification = "XOR";
          } else if (classifyElem.type.includes("Parallel")) {
            classifyElem.classification = "AND"
          } else if (classifyElem.type.includes("Inclusive")) {
            classifyElem.classification = "OR"
          }
        }
      }
      return toclassifyArray;
    }

    function calculateUncertainty(classifiedElements) {
      var calculateArray = classifiedElements;
      for (let m = 0; m < calculateArray.length; m++) {
        for (let n = 0; n < calculateArray[m].length; n++) {

          var filterCalculated = calculateArray.map(e => e.filter(m => m.calculated == false));
          var filterRemoved = calculateArray.map(e => e.filter(m => m.removed == false));

          for (let i = 0; i < filterCalculated.length; i++) {
            for (let j = 0; j < filterCalculated[i].length; j++) {
              if (filterCalculated[i][j + 1] != undefined &&
                filterCalculated[i][j].pairid != filterCalculated[i][j + 1].pairid &&
                filterCalculated[i][j].sm == "split" &&
                filterCalculated[i][j].classification != "LOOP") {
                for (let x = 0; x < calculateArray.length; x++) {
                  for (let y = 0; y < calculateArray[x].length; y++) {
                    if (filterCalculated[i][j].id == calculateArray[x][y].id) {
                      /**
                       * counter is increased if any of the branches is not calculated yet
                       * this is necessary to check if a block can be calculated
                       * if a branch of a block is not yet calculated, then the block cannot be calculated either
                       */
                      calculateArray[x][y].counter += 1;
                    }
                  }
                }
              } else if (filterCalculated[i][j].sm == "split" &&
                filterCalculated[i][j].classification == "LOOP") {
                //console.log('hello');
                for (let x = 0; x < filterCalculated.length; x++) {
                  var filterPairID = filterCalculated[x].filter(m => m.pairid == calculateArray[i][j].pairid);
                  //console.log(filterPairID);
                  if (filterPairID.length >= 3) {
                    //console.log('ello');
                    for (let y = 0; y < filterCalculated[x].length; y++) {
                      if (filterCalculated[x][y].id == calculateArray[i][j].id &&
                        (filterCalculated[x][y + 1].pairid != filterCalculated[i][j].pairid ||
                        filterCalculated[x][y - 1].pairid != filterCalculated[i][j].pairid)) {
                        for (let t = 0; t < filterCalculated.length; t++) {
                          for (let z = 0; z < filterCalculated[t].length; z++) {
                            if(calculateArray[i][j].id == calculateArray[t][z].id){
                              calculateArray[t][z].counter += 1;
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          for (let i = 0; i < calculateArray.length; i++) {
            for (let j = 0; j < calculateArray[i].length; j++) {
              if (calculateArray[i][j].counter == 0 &&
                calculateArray[i][j + 1] != undefined &&
                //calculateArray[i][j].pairid != calculateArray[i][j + 1].pairid &&
                !calculateArray[i][j].recordedBranches.includes(calculateArray[i][j + 1].id) &&
                calculateArray[i][j].sm == "split" &&
                calculateArray[i][j].classification != "LOOP") {
                for (let k = 0; k < shakenStartsSequences[i].length; k++) {
                  if (shakenStartsSequences[i][k].id == calculateArray[i][j].id) {
                    var id = shakenStartsSequences[i][k + 1].id;
                    var probabilityArray = id.split('_');
                    if (!isNaN(probabilityArray[1])) {
                      var probability = Number(probabilityArray[1]);
                    } else {
                      var probability = 0.5;
                    }
                    //console.log(probabilityArray[1]);
                  }
                }
                for (let x = 0; x < calculateArray.length; x++) {
                  for (let y = 0; y < calculateArray[x].length; y++) {
                    if (calculateArray[i][j].id == calculateArray[x][y].id) {
                      if (calculateArray[i][j].pairid != calculateArray[i][j + 1].pairid) {
                        if (!calculateArray[x][y].uncertaintyOfBranches.map(e => e.id).includes(id)) {
                          calculateArray[x][y].uncertaintyOfBranches.push({ id: id, uncertainty: calculateArray[i][j + 1].uncertainty, probability: probability });
                        }
                        calculateArray[x][y].recordedBranches.push(calculateArray[i][j + 1].pairid);
                      } else if (calculateArray[i][j].pairid == calculateArray[i][j + 1].pairid) {
                        if (!calculateArray[x][y].uncertaintyOfBranches.map(e => e.id).includes(id)) {
                          calculateArray[x][y].uncertaintyOfBranches.push({ id: id, uncertainty: 0, probability: probability });
                        }
                      }
                    }
                  }
                }
              } else if (calculateArray[i][j].counter == 0 &&
                calculateArray[i][j].recordedBranches.length == 0 &&
                calculateArray[i][j].sm == "split" &&
                calculateArray[i][j].classification == "LOOP") {
                var pairidArray = filterRemoved[i].map(e => e.pairid);
                //console.log(pairidArray);
                //console.log(calculateArray[i][j].pairid);
                var filteredPairArray = pairidArray.filter(m => m == calculateArray[i][j].pairid);
                //console.log(filteredPairArray);
                //var counter = 0;
                if (filteredPairArray.length >= 3) {
                  //console.log("i work fine");
                  for (let y = 0; y < filterRemoved[i].length; y++) {
                    if (filterRemoved[i][y].id == calculateArray[i][j].id) {
                      //console.log('i work too')
                      //if (!(counter > 0)) {
                      //counter += 1;
                      //console.log(filterRemoved);
                      if (filterRemoved[i][y].id == calculateArray[i][j].id &&
                        //filterRemoved[x][y-1] != undefined &&
                        filterRemoved[i][y - 1].pairid != filterRemoved[i][y].pairid &&
                        filterRemoved[i][y - 2].pairid == filterRemoved[i][y].pairid &&
                        !calculateArray[i][j].uncertaintyOfBranches.map(e => e.branch).includes(1)) {
                        //calculateArray[i][j].recordedBranches.push(filterRemoved[x][y-1].id);
                        //console.log(shakenStartsSequences);
                        //console.log('so do i');
                        for (let f = 0; f < calculateArray.length; f++) {
                          for (let g = 0; g < calculateArray[f].length; g++) {
                            if (calculateArray[i][j].id == calculateArray[f][g].id) {
                              calculateArray[f][g].uncertaintyOfBranches.push({ id: filterRemoved[i][y - 1].id, branch: 1, uncertainty: filterRemoved[i][y - 1].uncertainty });
                            }
                          }
                        }
                        //calculateArray[i][j].uncertaintyOfBranches.push({ id: filterRemoved[i][y - 1].id, branch: 1, uncertainty: filterRemoved[i][y - 1].uncertainty });
                        //console.log("loop branch getting pushed 1");
                      } else if (filterRemoved[i][y].id == calculateArray[i][j].id &&
                        //filterRemoved[x][y-1] != undefined &&
                        filterRemoved[i][y - 1].pairid == filterRemoved[i][y].pairid &&
                        !calculateArray[i][j].uncertaintyOfBranches.map(e => e.branch).includes(1)) {
                        for (let f = 0; f < calculateArray.length; f++) {
                          for (let g = 0; g < calculateArray[f].length; g++) {
                            if (calculateArray[i][j].id == calculateArray[f][g].id) {
                              calculateArray[f][g].uncertaintyOfBranches.push({ id: filterRemoved[i][y - 1].id, branch: 1, uncertainty: 0 });
                            }
                          }
                        }
                        //calculateArray[i][j].uncertaintyOfBranches.push({ id: filterRemoved[i][y - 1].id, branch: 1, uncertainty: 0, probability: probabilityArray[1]  });
                        //console.log("loop branch getting pushed 2");
                      }
                      if (filterRemoved[i][y].id == calculateArray[i][j].id &&
                        //filterRemoved[x][y-1] != undefined &&
                        filterRemoved[i][y + 1].pairid != filterRemoved[i][y].pairid &&
                        filterRemoved[i][y + 2].pairid == filterRemoved[i][y].pairid &&
                        !calculateArray[i][j].uncertaintyOfBranches.map(e => e.branch).includes(2)) {
                        for (let k = 0; k < shakenStartsSequences[i].length; k++) {
                          if (shakenStartsSequences[i][k].id == calculateArray[i][j].id) {
                            var probabilityArray = shakenStartsSequences[i][k + 1].id.split('_');
                            if (!isNaN(probabilityArray[1])) {
                              var probability = Number(probabilityArray[1]);
                            } else {
                              var probability = 0.5;
                            }
                            //console.log(probabilityArray[1]);
                          }
                        }
                        for (let f = 0; f < calculateArray.length; f++) {
                          for (let g = 0; g < calculateArray[f].length; g++) {
                            if (calculateArray[i][j].id == calculateArray[f][g].id) {
                              calculateArray[f][g].uncertaintyOfBranches.push({ id: filterRemoved[i][y + 1].id, branch: 2, uncertainty: filterRemoved[i][y + 1].uncertainty, probability: probability });
                            }
                          }
                        }

                        //console.log("loop branch getting pushed 3");
                      } else if (filterRemoved[i][y].id == calculateArray[i][j].id &&
                        //filterRemoved[x][y-1] != undefined &&
                        filterRemoved[i][y + 1].pairid == filterRemoved[i][y].pairid &&
                        !calculateArray[i][j].uncertaintyOfBranches.map(e => e.branch).includes(2)) {
                        for (let k = 0; k < shakenStartsSequences[i].length; k++) {
                          if (shakenStartsSequences[i][k].id == calculateArray[i][j].id) {
                            var probabilityArray = shakenStartsSequences[i][k + 1].id.split('_');
                            if (!isNaN(probabilityArray[1])) {
                              var probability = Number(probabilityArray[1]);
                            } else {
                              var probability = 0.5;
                            }
                            //console.log(probabilityArray[1]);
                          }
                        }
                        for (let f = 0; f < calculateArray.length; f++) {
                          for (let g = 0; g < calculateArray[f].length; g++) {
                            if (calculateArray[i][j].id == calculateArray[f][g].id) {
                              calculateArray[f][g].uncertaintyOfBranches.push({ id: filterRemoved[i][y + 1].id, branch: 2, uncertainty: 0, probability: probability });
                            }
                          }
                        }
                        //calculateArray[i][j].uncertaintyOfBranches.push({ id: filterRemoved[i][y + 1].id, branch: 2, uncertainty: 0, probability: probabilityArray[1]  });
                        //console.log("loop branch getting pushed 4");
                      }
                      // }
                    }
                  }
                }
              }
            }
          }

          for (let i = 0; i < calculateArray.length; i++) {
            for (let j = 0; j < calculateArray[i].length; j++) {
              if (calculateArray[i][j].counter == 0 &&
                calculateArray[i][j].removed == false &&
                calculateArray[i][j].sm == "split" &&
                calculateArray[i][j].calculated == false /*&&
                calculateArray[i][j].classification != "LOOP"*/) {
                if (calculateArray[i][j].classification == "XOR") {
                  const probabilityArray = calculateArray[i][j].uncertaintyOfBranches.map(e => e.probability);
                  //console.log(probabilityArray);
                  const calculatedProbabilityArray = probabilityArray.map(e => e * Math.log2(e));
                  //console.log(calculatedProbabilityArray);
                  const uncertainty1 = -1 * calculatedProbabilityArray.reduce((prev, cur) => prev + cur, 0);
                  //console.log(uncertainty1);
                  //const uncertainty1 = -1 * calculateArray[i][j].outgoing * ((1 / calculateArray[i][j].outgoing) * Math.log2(1 / calculateArray[i][j].outgoing));
                  const weightedUncertaintyArray = calculateArray[i][j].uncertaintyOfBranches.map(e => e.uncertainty * e.probability);
                  //const weightedUncertaintyArray = calculateArray[i][j].uncertaintyOfBranches.map(e => e * (1 / calculateArray[i][j].outgoing));
                  const uncertainty2 = weightedUncertaintyArray.reduce((prev, cur) => prev + cur, 0);
                  for (let g = 0; g < calculateArray.length; g++) {
                    for (let h = 0; h < calculateArray[g].length; h++) {
                      if (calculateArray[i][j].recordedBranches.includes(calculateArray[g][h].pairid)) {
                        calculateArray[g][h].removed = true;
                      }
                      if (calculateArray[i][j].id == calculateArray[g][h].id) {
                        calculateArray[g][h].uncertainty = uncertainty1 + uncertainty2;
                      }
                    }
                  }
                } else if (calculateArray[i][j].classification == "OR") {
                  const probabilityArray = calculateArray[i][j].uncertaintyOfBranches.map(e => e.probability);
                  const calculatedProbabilityArray1 = probabilityArray.map(e => e * Math.log2(e));
                  const calculatedProbabilityArray2 = probabilityArray.map(e => (1 - e) * Math.log2((1 - e)));
                  const uncertainty1 = -1 * calculatedProbabilityArray1.reduce((prev, cur) => prev + cur, 0);
                  const uncertainty2 = -1 * calculatedProbabilityArray2.reduce((prev, cur) => prev + cur, 0);
                  //const uncertainty1 = -1 * calculateArray[i][j].outgoing * (0.5 * Math.log2(0.5));
                  //const uncertainty2 = -1 * calculateArray[i][j].outgoing * ((1 - (0.5)) * Math.log2(1 - (0.5)));
                  const weightedUncertaintyArray = calculateArray[i][j].uncertaintyOfBranches.map(e => e.uncertainty * e.probability);
                  //const weightedUncertaintyArray = calculateArray[i][j].uncertaintyOfBranches.map(e => e * (0.5));
                  const uncertainty3 = weightedUncertaintyArray.reduce((prev, cur) => prev + cur, 0);
                  for (let g = 0; g < calculateArray.length; g++) {
                    for (let h = 0; h < calculateArray[g].length; h++) {
                      if (calculateArray[i][j].recordedBranches.includes(calculateArray[g][h].pairid)) {
                        calculateArray[g][h].removed = true;
                      }
                      if (calculateArray[i][j].id == calculateArray[g][h].id) {
                        calculateArray[g][h].uncertainty = uncertainty1 + uncertainty2 + uncertainty3;
                        //console.log(uncertainty1);
                        //console.log(uncertainty2);
                        //console.log(uncertainty3);
                      }
                    }
                  }
                  //calculateArray[i][j].uncertainty = 2;
                } else if (calculateArray[i][j].classification == "LOOP") {
                  const loopProbability = findLoopProbability(calculateArray[i][j].uncertaintyOfBranches);
                  //console.log(loopProbability);
                  const uncertainty1 = -1 * (1 - Math.pow(loopProbability, 10)) * ((loopProbability * Math.log2(loopProbability)) / (1 - loopProbability) + Math.log2((1 - loopProbability)));
                  const uncertainty2 = ((1 - Math.pow(loopProbability, 11)) / (1 - loopProbability)) * findUncertaintyOfBranch(calculateArray[i][j].uncertaintyOfBranches, 1);
                  //console.log(findUncertaintyOfBranch(calculateArray[i][j].uncertaintyOfBranches, 1));
                  const uncertainty3 = ((loopProbability - Math.pow(loopProbability, 11)) / (1 - loopProbability)) * findUncertaintyOfBranch(calculateArray[i][j].uncertaintyOfBranches, 2);
                  //console.log(findUncertaintyOfBranch(calculateArray[i][j].uncertaintyOfBranches, 2));
                  for (let g = 0; g < calculateArray.length; g++) {
                    for (let h = 0; h < calculateArray[g].length; h++) {
                      if (calculateArray[i][j].uncertaintyOfBranches.map(m => m.id).includes(calculateArray[g][h].id)) {
                        calculateArray[g][h].removed = true;
                      }
                      if (calculateArray[i][j].pairid == calculateArray[g][h].pairid) {
                        //console.log(uncertainty1);
                        //console.log(uncertainty2);
                        //console.log(uncertainty3);
                        calculateArray[g][h].uncertainty = uncertainty1 + uncertainty2 + uncertainty3;
                      }
                    }
                  }
                } else if (calculateArray[i][j].classification == "AND") {
                  for (let g = 0; g < calculateArray.length; g++) {
                    for (let h = 0; h < calculateArray[g].length; h++) {
                      if (calculateArray[i][j].recordedBranches.includes(calculateArray[g][h].pairid)) {
                        calculateArray[g][h].removed = true;
                      }
                      if (calculateArray[i][j].id == calculateArray[g][h].id) {
                        calculateArray[g][h].uncertainty = calculateArray[i][j].uncertaintyOfBranches.map(e => e.uncertainty).reduce((prev, cur) => prev + cur, 0);
                      }
                    }
                  }
                }
                for (let x = 0; x < calculateArray.length; x++) {
                  for (let y = 0; y < calculateArray[x].length; y++) {
                    if (calculateArray[x][y].pairid == calculateArray[i][j].pairid) {
                      calculateArray[x][y].calculated = true;
                    }
                    if (calculateArray[x][y].id != calculateArray[i][j].id &&
                      calculateArray[x][y].pairid == calculateArray[i][j].pairid &&
                      calculateArray[i][j].removed != true) {
                      calculateArray[x][y].removed = true;
                    }
                  }
                }
              }
            }
          }
          for (let i = 0; i < calculateArray.length; i++) {
            for (let j = 0; j < calculateArray[i].length; j++) {
              calculateArray[i][j].counter = 0;
            }
          }
          for (let i = 0; i < filterRemoved.length; i++) {
            for (let j = 0; j < filterRemoved[i].length; j++) {
              if (filterRemoved[i][j + 1] != undefined &&
                filterRemoved[i][j].calculated == true &&
                filterRemoved[i][j].removed == false &&
                filterRemoved[i][j + 1].calculated == true &&
                filterRemoved[i][j + 1].removed == false &&
                !filterRemoved[i][j].recordedBranches.includes(filterRemoved[i][j + 1].id)) {
                for (let x = 0; x < calculateArray.length; x++) {
                  for (let y = 0; y < calculateArray[x].length; y++) {
                    if (calculateArray[x][y].id == filterRemoved[i][j].id) {
                      calculateArray[x][y].uncertainty += filterRemoved[i][j + 1].uncertainty;
                      //console.log(calculateArray[x][y].uncertainty);
                      //console.log(filterRemoved[i][j + 1].uncertainty);
                    }
                    if (calculateArray[x][y].id == filterRemoved[i][j + 1].id) {
                      calculateArray[x][y].removed = true;
                    }
                  }
                }
              }
            }
          }
        }
      }
      console.log(calculateArray);
      console.log(filterRemoved);
      const filteredArray = calculateArray.map(e => e.filter(m => m.removed == false));
      const totalUncertainty = filteredArray[0].map(e => e.uncertainty).reduce((prev, cur) => prev + cur, 0);
      //const firstElement = filteredArray[0][0];
      return totalUncertainty;
    }

    function findUncertaintyOfBranch(array, branch) {
      for (let i = 0; i < array.length; i++) {
        if (array[i].branch == branch) {
          return array[i].uncertainty;
        }
      }
      return 0;
    }

    function findLoopProbability(array) {
      for (let i = 0; i < array.length; i++) {
        if (array[i].branch == 2) {
          return array[i].probability;
        }
      }
      return 0.5;
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

