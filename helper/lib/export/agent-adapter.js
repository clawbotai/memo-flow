'use strict';

/**
 * Reserved extension point for future agent-backed export providers.
 * V1 keeps this interface internal only and does not register any runtime.
 */

class AgentExportAdapter {
  get id() {
    throw new Error('Agent export adapter must implement id');
  }

  async execute() {
    throw new Error('Agent export adapter must implement execute()');
  }
}

module.exports = {
  AgentExportAdapter,
};
