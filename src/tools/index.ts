import { initializePriceTool } from "./price.js";


/**
 * Load all available tools
 */
export async function loadTools() {
  const toolFactories = [
    initializePriceTool,
    initializeTradingTool,
    // initializeTransferTool,
    // initializeTransactionTool,
  ];

  // Use Promise.all with map instead of for...of
  