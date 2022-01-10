# ProcessAnalyzer

This application is designed to calculate the uncertainty of business processes.
The method and the formulas used were published by Jung, Chin and Cardoso in their paper "An entropy-based uncertainty measure of process models", which was published in the journal "Information Processing Letters" in 2011.
Please refer to the paper if information about the method and the formulas are required.

## Installing and executing the ProcessAnalyzer

This application requires Node.js and npm (node package manager) to be installed on your machine.

This application was tested for Node.js version 14.17.6 and npm version 6.14.15.

In order to install the process-analyzer, download the ProcessAnalyzer and save it on the machine.

Then open a command line interface tool and move into the root directory of the ProcessAnalyzer.

Execute the command:

#### npm install

After the all the necessary packages have been downoaded, the application is installed. The "npm install" command only needs to be executed the first time.

Next execute the command:

#### npm start

This command starts the application. Now the Browser should open automatically. If the browser doesn't open automatically, open your brower and go to the following url:

#### http://localhost:8080/

## Using the ProcessAnalyzer

In order to calculate the uncertainty of a business process, it is required to create a business process model with the help of a suited application. During the development of this application, business process models have been created with the tool Camunda.

If a business process model exists, it can be calculated by the application by dragging the .bpmn file into the browser. The application will automatically visualize the process and its uncertainty.

If a new process should be calculated, the application can be reset simply by refreshing the browser.
