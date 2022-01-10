/*
  Part of this code was used from the following projects:
  bpmn-js:
  https://github.com/bpmn-io/bpmn-js-examples/tree/master/modeler
  bpmn-engine:
  https://github.com/paed01/bpmn-engine
*/

import $ from 'jquery';
import BpmnViewer from 'bpmn-js/lib/Viewer';
const { Engine } = require('bpmn-engine');
const BpmnModdle = require('bpmn-moddle').default;
const elements = require('bpmn-elements');
const { default: Serializer, TypeResolver } = require('moddle-context-serializer');


/**
 * BPMN Viewer for the visualization of the imported process
 * as well as the functionality to import .bpmn files
 **/

var container = $('#js-drop-zone');
var viewer = new BpmnViewer({
  container: $('#js-canvas'),
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
   * BPMN-ENGINE
   * Important Note!!!: The Startevent of the BPMN-Process
   * has to have the id "start", otherwise the loading process
   * will fail
   * 
   * The bpmn-engine imports the process from the XML file
   * and structures the possible paths of the process in
   * different arrays
   */
  (async function IIFE() {
    const moddleContext = await (new BpmnModdle({
      camunda: require('camunda-bpmn-moddle/resources/camunda.json'),
    })).fromXML(xml);

    /**
     * The elementRegistry contains information that the bpmn-engine
     * already pre-filters
     * Some of this information is needed later
     * The element registry is not part of the bpmn-engine, but rather
     * is a part of the bpmn-js library
     */
    const elementRegistry = viewer.get('elementRegistry');
    const businessElements = elementRegistry._elements;
    const sourceContext = Serializer(moddleContext, TypeResolver(elements));
    const engine = Engine({
      sourceContext,
    });

    const [definition] = await engine.getDefinitions();

    /**
     * shakenStarts is the product of the bpmn-engine and provides the sequences
     * of the process along with some meta data of the bpmn process
     */
    const shakenStarts = definition.shake();

    // filtering the process meta data since it is not needed
    const shakenStartsSequences = shakenStarts.start.map(e => e.sequence);

    /**
     * Removing Tasks, Sequenceflows, StartEvents and EndEvents from the sequences
     * The only elements needed for the algorithm are the gateways
     */
    const shakenStartsFiltered = shakenStartsSequences
      .map(e => e.filter(e => !e.type.includes("EndEvent")
        && !e.type.includes("StartEvent") && !e.type.includes("Task")
        && !e.type.includes("SequenceFlow")));

    /**
     * Applying a custom function to each remaining element in order to add
     * some necessary information
     */
    const convertedElements = shakenStartsFiltered
      .map(m => m.map(e => convertElements(e)));

    /**
     * Applying a custom function to the arrays in order to pair the elements
     * This is necessary in order to identify "blocks" within the bpmn process
     * A pair consists of two gateways
     * Each of the gateways marks the start and the end of the block respectively
     * Paired elements share the same pairid
     */
    const pairedElements = pairElements(convertedElements);

    /**
     * Applying a custom function to the arrays in order to classify the blocks
     * within the bpmn process
     * The blocks will be classified as one of the following: XOR, OR, AND, LOOP
     */
    const classifiedElements = classifyElements(pairedElements);

    /**
     * Applying a custom function to the arrays in order to calculate the
     * uncertainty of the entire process
     */
    const uncertainty = calculateUncertainty(classifiedElements);

    /**
     * changeLabel visualizes the calculated uncertainty of the bpmn process
     * on the HTML page
     */
    changeLabel();
    function changeLabel() {
      let lbl = document.getElementById('calculatedUncertainty');
      lbl.innerText = "The uncertainty of the business process: " + uncertainty;
    }

    /**
     * This function adds necessary information to each element of the bpmn process
     * This function also determines, whether a gateway is a splitting gateway
     * or a merging gateway (attribute "sm")
     * Some of these attributes are permanent and remain unchanged like the id
     * attribute or the sm attribute, while other attributes might be changed
     * as needed
     * The boolean attributes "removed" and "calculated" store the state of each
     * element and are necessary for the calculation
     */
    function convertElements(e) {
      const fullElement = businessElements[e.id];
      const incoming = fullElement.element.incoming.length;
      const outgoing = fullElement.element.outgoing.length;
      if (incoming == 1 && outgoing > 1) {
        return ({
          id: e.id, type: e.type, sm: "split", outgoing: outgoing,
          uncertainty: 0, uncertaintyOfBranches: [], recordedBranches: [],
          removed: false, calculated: false, counter: 0, paired: false, pairid: "",
          isLoop: false, classification: ""
        });
      } else if (incoming > 1 && outgoing == 1) {
        return ({
          id: e.id, type: e.type, sm: "merge", incoming: incoming,
          uncertainty: 0, uncertaintyOfBranches: [], recordedBranches: [],
          removed: false, calculated: false, counter: 0, paired: false,
          pairid: "", isLoop: false, classification: ""
        });
      }
    };

    /**
     * This function is responsible for pairing the gateways in order to identify
     * blocks within the process
     * Gateways will be paired if a merging gateway follows a splitting gateway
     * in the same sequence
     * In the next iteration paired elements will be removed in order to pair
     * gateways that contain closed blocks
     * This method only works correctly if the process only contains "clean" blocks
     * that are properly closed and do not overlap with other blocks
     */
    function pairElements(listsOfElements) {
      var pairedList = listsOfElements;
      for (let x = 0; x < listsOfElements.length; x++) {
        var filteredUnpairedList = pairedList
          .map(e => e.filter(m => m.paired != true));
        if (filteredUnpairedList.length >= 0) {
          for (let i = 0; i < filteredUnpairedList.length; i++) {
            const listOfElements = filteredUnpairedList[i];
            for (let j = 0; j < listOfElements.length; j++) {
              if (checkIfSequence(filteredUnpairedList,
                listOfElements[j],
                listOfElements[j + 1])) {
                pairedList = setAttributes(pairedList,
                  listOfElements[j],
                  listOfElements[j + 1]);
              }
            }
          }
        }
      }
      const pairidArray = pairedList.map(m => m.map(e => e.pairid));
      /**
       * Because loops have an inverted pattern (merging gateway comes first)
       * this can cause the function to pair some elements incorrectly if loops
       * are present in the process
       * However, loops can be identified because the merging gateway appears twice
       * in one of the sequences
       * This way the incorrect pairings can be reverted
       */
      const duplicates = pairidArray
        .map(e => e.filter((elem, index) => e.indexOf(elem) !== index));
      var duplicatesConverted = [];
      for (let i = 0; i < duplicates.length; i++) {
        duplicatesConverted = duplicatesConverted.concat(duplicates[i]);
      }
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

    /**
     * This function checks if a splitting gateway is followed by a merging
     * gateway
     */
    function checkIfSequence(unpairedElements, a, b) {
      var check = false;
      if (b != undefined) {
        for (let i = 0; i < unpairedElements.length; i++) {
          const elements = unpairedElements[i];
          for (let j = 0; j < elements.length - 1; j++) {
            if ((elements[j].id == a.id && elements[j + 1].id == b.id) &&
              (a.sm == "split" && b.sm == "merge")) {
              check = true;
            }
          }
        }
      }
      return check;
    }

    /**
     * This function creates a unique pairid for two elements that have been
     * detected as a pair
     * To ensure that the pairid is unique, the id of both elements is combined
     * into the pairid, while both ids are separated by a "_" character
     * Afterwards the function sets the pairids for both elements and also
     * sets the bolean attribute "ispaired" to "true"
     */
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

    /**
     * This function classifies each element of the business process
     * Because loops are not bound to a specific type of element, loops have to
     * be detected first
     * After a loop has been detected, the "isloop" attribute is set to "true" for
     * the involved elements
     * Then the elements can be classified
     * If the "isloop" attribute is "true", then the element is classified as part
     * of a loop block
     * If the "isloop" attribute is false, then the elements will be classified
     * according to their gateway type (exclusive, parallel, inclusive)
     */
    function classifyElements(elemArray) {
      const idArray = elemArray.map(m => m.map(e => e.id));
      var toclassifyArray = elemArray;
      const duplicates = idArray
        .map(e => e.filter((elem, index) => e.indexOf(elem) !== index));
      var duplicatesConverted = [];
      for (let i = 0; i < duplicates.length; i++) {
        duplicatesConverted = duplicatesConverted.concat(duplicates[i]);
      }
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

    /**
     * This function is responsible for calculating the uncertainty of the
     * entire business process
     * Blocks can only be calculated if they do not contain any uncalculated blocks
     * For this reason the calculation is an iterative process and many
     * requirements have to be checked before the actual calculation
     */
    function calculateUncertainty(classifiedElements) {
      var calculateArray = classifiedElements;
      for (let m = 0; m < calculateArray.length; m++) {
        for (let n = 0; n < calculateArray[m].length; n++) {
          // filterCalculated only contains elements that have not
          // been calculated yet by checking the "calculated" attribute
          var filterCalculated = calculateArray
            .map(e => e.filter(m => m.calculated == false));
          // filterRemoved only contains elements that have not
          // been removed yet by checking the "removed" attribute
          var filterRemoved = calculateArray
            .map(e => e.filter(m => m.removed == false));
          /**
           * At first it is necessary to iterate over all arrays in order to
           * detect which blocks can be calculated
           * A block can only be calculated if it doesn't contain any other
           * uncalculated blocks
           * Since each array only stores one path of the business process,
           * a counter has to be introduced in order to keep track of any
           * uncalculated blocks that reside inside of any other block in any path
           * of the business process
           * The counter needs to be increased for the relevant element in each
           * array
           * The counter is stored in the splitting element, since this is also the
           * center of interest for the calculation
           */
          for (let i = 0; i < filterCalculated.length; i++) {
            for (let j = 0; j < filterCalculated[i].length; j++) {
              if (filterCalculated[i][j + 1] != undefined &&
                filterCalculated[i][j].pairid != filterCalculated[i][j + 1].pairid &&
                filterCalculated[i][j].sm == "split" &&
                filterCalculated[i][j].classification != "LOOP") {
                for (let x = 0; x < calculateArray.length; x++) {
                  for (let y = 0; y < calculateArray[x].length; y++) {
                    if (filterCalculated[i][j].id == calculateArray[x][y].id) {
                      calculateArray[x][y].counter += 1;
                    }
                  }
                }
                /**
                 * Loops have to checked separately, because blocks can be
                 * inside of a loop block while being positioned before or
                 * after the splitting gateway of the loop block
                 */
              } else if (filterCalculated[i][j].sm == "split" &&
                filterCalculated[i][j].classification == "LOOP") {
                for (let x = 0; x < filterCalculated.length; x++) {
                  var filterPairID = filterCalculated[x]
                    .filter(m => m.pairid == calculateArray[i][j].pairid);
                  /**
                   * Only the array that contains the repatriating path of the loop
                   * contains information of both relevant sides of the splitting
                   * gateway
                   * Therefore the array that contains the duplicate merging
                   * gateway is identified before applying the counter
                   */
                  if (filterPairID.length >= 3) {
                    for (let y = 0; y < filterCalculated[x].length; y++) {
                      if (filterCalculated[x][y].id == calculateArray[i][j].id &&
                        (filterCalculated[x][y + 1].pairid !=
                          filterCalculated[i][j].pairid ||
                          filterCalculated[x][y - 1].pairid !=
                          filterCalculated[i][j].pairid)) {
                        for (let t = 0; t < filterCalculated.length; t++) {
                          for (let z = 0; z < filterCalculated[t].length; z++) {
                            if (calculateArray[i][j].id == calculateArray[t][z].id) {
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

          /**
           * Next, the uncertainty of a calculated block that resides inside of
           * another block is added to a storage array in the outer block
           * That way the uncertainty of inner blocks can be considered when
           * calculating the uncertainty of outer blocks
           * Furthermore, the probability of the according path is stored along
           * with the uncertainty of that path
           */
          for (let i = 0; i < calculateArray.length; i++) {
            for (let j = 0; j < calculateArray[i].length; j++) {
              if (calculateArray[i][j].counter == 0 &&
                calculateArray[i][j + 1] != undefined &&
                !calculateArray[i][j].recordedBranches
                  .includes(calculateArray[i][j + 1].id) &&
                calculateArray[i][j].sm == "split" &&
                calculateArray[i][j].classification != "LOOP") {
                /**
                 * The probability of a path has to be stored within the id of
                 * the according sequence by adding "_x.y_" in front of the sequence
                 * id, while x.y is the probability as a decimal number
                 * For example: the id of the sequence is "Sequence_eireg35j"
                 * Then the probability can be added
                 * like this: "_0.7_Sequence_eireg35j"
                 * If there is no valid number defined as probability, then
                 * the probability 0.5 is set automatically
                 */
                for (let k = 0; k < shakenStartsSequences[i].length; k++) {
                  if (shakenStartsSequences[i][k].id == calculateArray[i][j].id) {
                    var id = shakenStartsSequences[i][k + 1].id;
                    var probabilityArray = id.split('_');
                    if (!isNaN(probabilityArray[1])) {
                      var probability = Number(probabilityArray[1]);
                    } else {
                      var probability = 0.5;
                    }
                  }
                }
                for (let x = 0; x < calculateArray.length; x++) {
                  for (let y = 0; y < calculateArray[x].length; y++) {
                    if (calculateArray[i][j].id == calculateArray[x][y].id) {
                      /**
                       * If there is a calculated block within a another block,
                       * then the uncertainty will be added to the storage of
                       * the outer block
                       */
                      if (calculateArray[i][j].pairid !=
                        calculateArray[i][j + 1].pairid) {
                        if (!calculateArray[x][y].uncertaintyOfBranches
                          .map(e => e.id).includes(id)) {
                          calculateArray[x][y].uncertaintyOfBranches
                            .push({
                              id: id,
                              uncertainty: calculateArray[i][j + 1].uncertainty,
                              probability: probability
                            });
                        }
                        calculateArray[x][y].recordedBranches
                          .push(calculateArray[i][j + 1].pairid);
                        /**
                         * If there is no block inside of this block at the current
                         * path, then the uncertainty 0 is added to the storage
                         * This occurs when only Tasks reside within a block
                         * Tasks do not increase the uncertainty
                         */
                      } else if (calculateArray[i][j].pairid ==
                        calculateArray[i][j + 1].pairid) {
                        if (!calculateArray[x][y].uncertaintyOfBranches
                          .map(e => e.id).includes(id)) {
                          calculateArray[x][y].uncertaintyOfBranches
                            .push({
                              id: id,
                              uncertainty: 0,
                              probability: probability
                            });
                        }
                      }
                    }
                  }
                }
                /**
                 * The process of adding the uncertainty of inner blocks to the
                 * storage of outer blocks is different for loops, because it is
                 * necessary to define whether the inner block is positioned before
                 * or after the splitting gateway
                 */
              } else if (calculateArray[i][j].counter == 0 &&
                calculateArray[i][j].recordedBranches.length == 0 &&
                calculateArray[i][j].sm == "split" &&
                calculateArray[i][j].classification == "LOOP") {
                var pairidArray = filterRemoved[i].map(e => e.pairid);
                var filteredPairArray = pairidArray
                  .filter(m => m == calculateArray[i][j].pairid);
                /**
                 * Like before, the repatriating path of the loop has to be
                 * identified first, before the uncertainty of the inner blocks
                 * can be added to the storage of the splitting gateway of the
                 * loop block
                 * In the repatriating path, the merge gateway appears twice
                 * This means that there will be 3 gateways with the same pairid
                 * in this path
                 */
                if (filteredPairArray.length >= 3) {
                  for (let y = 0; y < filterRemoved[i].length; y++) {
                    /**
                     * The first case checks if there is a calculated block
                     * before the splitting gateway of the loop block
                     * If there is a calculated block before the splitting gateway
                     * of the loop block, then it is added to the storage and stored
                     * with the note that this is branch 1
                     */
                    if (filterRemoved[i][y].id == calculateArray[i][j].id) {
                      if (filterRemoved[i][y].id == calculateArray[i][j].id &&
                        filterRemoved[i][y - 1].pairid !=
                        filterRemoved[i][y].pairid &&
                        filterRemoved[i][y - 2].pairid ==
                        filterRemoved[i][y].pairid &&
                        !calculateArray[i][j].uncertaintyOfBranches
                          .map(e => e.branch).includes(1)) {
                        for (let f = 0; f < calculateArray.length; f++) {
                          for (let g = 0; g < calculateArray[f].length; g++) {
                            if (calculateArray[i][j].id == calculateArray[f][g].id) {
                              calculateArray[f][g].uncertaintyOfBranches
                                .push({
                                  id: filterRemoved[i][y - 1].id,
                                  branch: 1,
                                  uncertainty: filterRemoved[i][y - 1].uncertainty
                                });
                            }
                          }
                        }
                        /**
                         * If there is no block before the splitting gateway (for
                         * example if only a Task resides there), then the
                         * uncertainty 0 is added to the storage for branch 1
                         */
                      } else if (filterRemoved[i][y].id ==
                        calculateArray[i][j].id &&
                        filterRemoved[i][y - 1].pairid ==
                        filterRemoved[i][y].pairid &&
                        !calculateArray[i][j].uncertaintyOfBranches
                          .map(e => e.branch).includes(1)) {
                        for (let f = 0; f < calculateArray.length; f++) {
                          for (let g = 0; g < calculateArray[f].length; g++) {
                            if (calculateArray[i][j].id == calculateArray[f][g].id) {
                              calculateArray[f][g].uncertaintyOfBranches
                                .push({
                                  id: filterRemoved[i][y - 1].id,
                                  branch: 1,
                                  uncertainty: 0
                                });
                            }
                          }
                        }
                      }
                      /**
                       * Now the same procedure has to be done for branch 2
                       * Branch 2 describes the loop-back path
                       * Here, also the loop-back probability is stored along
                       * with the uncertainty of any inner blocks
                       * The probability is detected by examining the id of
                       * the according sequence, as it was already explained before
                       */
                      if (filterRemoved[i][y].id == calculateArray[i][j].id &&
                        filterRemoved[i][y + 1].pairid !=
                        filterRemoved[i][y].pairid &&
                        filterRemoved[i][y + 2].pairid ==
                        filterRemoved[i][y].pairid &&
                        !calculateArray[i][j].uncertaintyOfBranches
                          .map(e => e.branch).includes(2)) {
                        for (let k = 0; k < shakenStartsSequences[i].length; k++) {
                          if (shakenStartsSequences[i][k].id ==
                            calculateArray[i][j].id) {
                            var probabilityArray = shakenStartsSequences[i][k + 1]
                              .id.split('_');
                            if (!isNaN(probabilityArray[1])) {
                              var probability = Number(probabilityArray[1]);
                            } else {
                              var probability = 0.5;
                            }
                          }
                        }
                        for (let f = 0; f < calculateArray.length; f++) {
                          for (let g = 0; g < calculateArray[f].length; g++) {
                            if (calculateArray[i][j].id == calculateArray[f][g].id) {
                              calculateArray[f][g].uncertaintyOfBranches
                                .push({
                                  id: filterRemoved[i][y + 1].id,
                                  branch: 2,
                                  uncertainty: filterRemoved[i][y + 1].uncertainty,
                                  probability: probability
                                });
                            }
                          }
                        }
                        /**
                         * And again, if there is no block within branch 2, then
                         * the uncertainty 0 is stored along with the probabilty
                         * of the loop-back path
                         */
                      } else if (filterRemoved[i][y].id ==
                        calculateArray[i][j].id &&
                        filterRemoved[i][y + 1].pairid ==
                        filterRemoved[i][y].pairid &&
                        !calculateArray[i][j].uncertaintyOfBranches
                          .map(e => e.branch).includes(2)) {
                        for (let k = 0; k < shakenStartsSequences[i].length; k++) {
                          if (shakenStartsSequences[i][k].id ==
                            calculateArray[i][j].id) {
                            var probabilityArray = shakenStartsSequences[i][k + 1]
                              .id.split('_');
                            if (!isNaN(probabilityArray[1])) {
                              var probability = Number(probabilityArray[1]);
                            } else {
                              var probability = 0.5;
                            }
                          }
                        }
                        for (let f = 0; f < calculateArray.length; f++) {
                          for (let g = 0; g < calculateArray[f].length; g++) {
                            if (calculateArray[i][j].id == calculateArray[f][g].id) {
                              calculateArray[f][g].uncertaintyOfBranches
                                .push({
                                  id: filterRemoved[i][y + 1].id,
                                  branch: 2, uncertainty: 0,
                                  probability: probability
                                });
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

          /**
           * In this part, the actual calculation of the uncertainty of each block
           * takes place
           * A block can only be calculated if there are no other uncalculated
           * blocks residing inside of the block
           * The calculation takes place when reaching the splitting gateways
           * The calculated uncertainty of inner blocks is also stored within
           * the splitting gateways
           * Each different block type comes with its own formula for the
           * calculation of its uncertainty
           */
          for (let i = 0; i < calculateArray.length; i++) {
            for (let j = 0; j < calculateArray[i].length; j++) {
              if (calculateArray[i][j].counter == 0 &&
                calculateArray[i][j].removed == false &&
                calculateArray[i][j].sm == "split" &&
                calculateArray[i][j].calculated == false) {
                /**
                 * XOR blocks are calculated here
                 */
                if (calculateArray[i][j].classification == "XOR") {
                  /**
                   * The probabilityArray stores the probabilities of each
                   * outgoing paths of the splitting gateway
                   */
                  const probabilityArray = calculateArray[i][j]
                    .uncertaintyOfBranches.map(e => e.probability);
                  /**
                   * Here the probabilities are used to calculate a part
                   * of the uncertainty of the XOR block
                   */
                  const calculatedProbabilityArray = probabilityArray
                    .map(e => e * Math.log2(e));
                  /**
                   * In order to keep the formulas shorter, the formulas were
                   * split into parts
                   * Here the uncertainty of the XOR block is calculated in 2
                   * parts
                   * The first part is calculated in uncertainty1
                   * The second part is calculated in uncertainty2
                   */
                  const uncertainty1 = -1 * calculatedProbabilityArray
                    .reduce((prev, cur) => prev + cur, 0);
                  const weightedUncertaintyArray = calculateArray[i][j]
                    .uncertaintyOfBranches.map(e => e.uncertainty * e.probability);
                  const uncertainty2 = weightedUncertaintyArray
                    .reduce((prev, cur) => prev + cur, 0);
                  for (let g = 0; g < calculateArray.length; g++) {
                    for (let h = 0; h < calculateArray[g].length; h++) {
                      if (calculateArray[i][j].recordedBranches
                        .includes(calculateArray[g][h].pairid)) {
                        /**
                         * If the uncertainty of a block has been calculated,
                         * every inner block has to be removed from all arrays
                         * This happens by marking them with the according attribute
                         * These elements will be filtered in future iterations
                         */
                        calculateArray[g][h].removed = true;
                      }
                      if (calculateArray[i][j].id == calculateArray[g][h].id) {
                        /**
                         * Here both parts of the calculated uncertainty are
                         * added together and stored in the according element
                         * It is necessary to iterate over all arrays, because
                         * the element in which the uncertainty has to be stored
                         * can be present in multiple arrays (paths)
                         */
                        calculateArray[g][h].uncertainty =
                          uncertainty1 + uncertainty2;
                      }
                    }
                  }
                  /**
                   * OR blocks are calculated here
                   * The process is the same as with XOR blocks, but
                   * the formula is different
                   */
                } else if (calculateArray[i][j].classification == "OR") {
                  const probabilityArray = calculateArray[i][j]
                    .uncertaintyOfBranches.map(e => e.probability);
                  const calculatedProbabilityArray1 = probabilityArray
                    .map(e => e * Math.log2(e));
                  const calculatedProbabilityArray2 = probabilityArray
                    .map(e => (1 - e) * Math.log2((1 - e)));
                  /**
                   * The formula for OR blocks is split into 3 parts: uncertainty1,
                   * uncertainty2 and uncertainty3
                   * They will be combined before adding the calculated value to
                   * the according elements
                   */
                  const uncertainty1 = -1 * calculatedProbabilityArray1
                    .reduce((prev, cur) => prev + cur, 0);
                  const uncertainty2 = -1 * calculatedProbabilityArray2
                    .reduce((prev, cur) => prev + cur, 0);
                  const weightedUncertaintyArray = calculateArray[i][j]
                    .uncertaintyOfBranches.map(e => e.uncertainty * e.probability);
                  const uncertainty3 = weightedUncertaintyArray
                    .reduce((prev, cur) => prev + cur, 0);
                  for (let g = 0; g < calculateArray.length; g++) {
                    for (let h = 0; h < calculateArray[g].length; h++) {
                      if (calculateArray[i][j].recordedBranches
                        .includes(calculateArray[g][h].pairid)) {
                        /**
                         * Removing inner blocks from the arrays
                         */
                        calculateArray[g][h].removed = true;
                      }
                      if (calculateArray[i][j].id == calculateArray[g][h].id) {
                        /**
                         * Combining the different parts of the uncertainty and
                         * storing it in the according elements
                         */
                        calculateArray[g][h].uncertainty =
                          uncertainty1 + uncertainty2 + uncertainty3;
                      }
                    }
                  }
                  /**
                   * LOOP blocks are calculated here
                   */
                } else if (calculateArray[i][j].classification == "LOOP") {
                  const loopProbability = findLoopProbability(calculateArray[i][j]
                    .uncertaintyOfBranches);
                  /**
                   * The formula has been split into 3 parts here as well
                   * As the formulas are defined right now, it calculates the
                   * uncertainty for the case that the loop has no looping limit
                   * If the uncertainty should be calculated for a specific looping
                   * limit, then the commented parts of the formulas have to be
                   * activated
                   * The looping limit goes where the 10 and 11 is right now
                   * If the looping limit is 5, then 10 has to be replaced by 5
                   * and 11 has to be replaced by 6
                   * See the actual formulas in the master thesis for more
                   * detailed information
                   */
                  const uncertainty1 = -1 * (1 /*- Math.pow(loopProbability, 10)*/)
                    * ((loopProbability * Math.log2(loopProbability)) /
                      (1 - loopProbability) + Math.log2((1 - loopProbability)));
                  const uncertainty2 = ((1 /*- Math.pow(loopProbability, 11)*/)
                    / (1 - loopProbability)) *
                    findUncertaintyOfBranch(calculateArray[i][j]
                      .uncertaintyOfBranches, 1);
                  const uncertainty3 =
                    ((loopProbability /*- Math.pow(loopProbability, 11)*/)
                      / (1 - loopProbability)) *
                    findUncertaintyOfBranch(calculateArray[i][j]
                      .uncertaintyOfBranches, 2);
                  for (let g = 0; g < calculateArray.length; g++) {
                    for (let h = 0; h < calculateArray[g].length; h++) {
                      if (calculateArray[i][j].uncertaintyOfBranches
                        .map(m => m.id).includes(calculateArray[g][h].id)) {
                        /**
                         * Removing inner blocks from the arrays
                         */
                        calculateArray[g][h].removed = true;
                      }
                      if (calculateArray[i][j].pairid ==
                        calculateArray[g][h].pairid) {
                        /**
                         * Combining the parts of the uncertainty and storing it
                         */
                        calculateArray[g][h].uncertainty =
                          uncertainty1 + uncertainty2 + uncertainty3;
                      }
                    }
                  }
                  /**
                   * AND blocks are calculated here
                   */
                } else if (calculateArray[i][j].classification == "AND") {
                  for (let g = 0; g < calculateArray.length; g++) {
                    for (let h = 0; h < calculateArray[g].length; h++) {
                      if (calculateArray[i][j].recordedBranches
                        .includes(calculateArray[g][h].pairid)) {
                        /**
                         * Removing inner blocks from the arrays
                         */
                        calculateArray[g][h].removed = true;
                      }
                      if (calculateArray[i][j].id == calculateArray[g][h].id) {
                        /**
                         * Calculating the uncertainty of the AND block and
                         * storing it
                         * The formula for AND blocks is very simple and therefore
                         * is wasn't necessary to split it into parts
                         */
                        calculateArray[g][h].uncertainty = calculateArray[i][j]
                          .uncertaintyOfBranches.map(e => e.uncertainty)
                          .reduce((prev, cur) => prev + cur, 0);
                      }
                    }
                  }
                }
                /**
                 * Here the element which has been calculated in this iteration
                 * is marked by setting the boolean attribute "calculated" to "true"
                 * Also, only the splitting gateway of a calculated block remains
                 * in the arrays
                 * Therefore, the merging gateways with the same pairid are removed
                 * by setting their boolean "removed" attribute to "true"
                 */
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
          /**
           * Since a block has been calculated before, the counter attribute is
           * reset for all elements in all arrays
           * The counter attribute stores the information if uncalculated blocks
           * reside in an outer block
           * In the next iteration, this has to be evaluated again for every element
           * Therefore this reset is necessary
           */
          for (let i = 0; i < calculateArray.length; i++) {
            for (let j = 0; j < calculateArray[i].length; j++) {
              calculateArray[i][j].counter = 0;
            }
          }
          /**
           * If all elements have been calculated, but there are still multiple
           * elements in the arrays, then the remaining blocks are in a sequence
           * to each other
           * Therefore, if all elements are marked as calculated, the uncertainty
           * of the remaining elements is combined and stored in one element
           * This leads to the circumstance, that in the end, the total uncertainty
           * of the business process is stored in one element
           * All other elements are being removed in this process
           */
          for (let i = 0; i < filterRemoved.length; i++) {
            for (let j = 0; j < filterRemoved[i].length; j++) {
              if (filterRemoved[i][j + 1] != undefined &&
                filterRemoved[i][j].calculated == true &&
                filterRemoved[i][j].removed == false &&
                filterRemoved[i][j + 1].calculated == true &&
                filterRemoved[i][j + 1].removed == false &&
                !filterRemoved[i][j].recordedBranches
                  .includes(filterRemoved[i][j + 1].id)) {
                for (let x = 0; x < calculateArray.length; x++) {
                  for (let y = 0; y < calculateArray[x].length; y++) {
                    if (calculateArray[x][y].id == filterRemoved[i][j].id) {
                      calculateArray[x][y].uncertainty +=
                        filterRemoved[i][j + 1].uncertainty;
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
      const filteredArray = calculateArray
      .map(e => e.filter(m => m.removed == false));
      const totalUncertainty = filteredArray[0].map(e => e.uncertainty)
      .reduce((prev, cur) => prev + cur, 0);
      return totalUncertainty;
    }

    /**
     * Helper function to return the uncertainty of a specific branch of a loop block
     */
    function findUncertaintyOfBranch(array, branch) {
      for (let i = 0; i < array.length; i++) {
        if (array[i].branch == branch) {
          return array[i].uncertainty;
        }
      }
      return 0;
    }

    /**
     * Helper function to return the loop-back probability of a loop block
     */
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

/**
 * This section enables the drag and drop functionality of this application and was
 * developed in the bpmn.io project that has been mentioned at the beginning
 */
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
    e.dataTransfer.dropEffect = 'copy';
  }
  container.get(0).addEventListener('dragover', handleDragOver, false);
  container.get(0).addEventListener('drop', handleFileSelect, false);
}

if (!window.FileList || !window.FileReader) {
  window.alert(
    'Looks like you use an older browser that does not support drag and drop. ' +
    'Try using Chrome, Firefox or the Internet Explorer > 10.');
} else {
  registerFileDrop(container, openDiagram);
}

