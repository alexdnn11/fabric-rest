/**
 * Created by maksim on 7/18/17.
 */
"use strict";
// const util = require('util');
// const helper = require('./helper');
// const ConfigHelper = require('./helper').ConfigHelper;
const TYPE_ENDORSER_TRANSACTION = 'ENDORSER_TRANSACTION';

var log4js = require('log4js');
var logger = log4js.getLogger('Socket');
var peerListener = require('../lib-fabric/peer-listener.js');
var tools = require('../lib/tools');

var hfc = require('../lib-fabric/hfc');
var networkConfig = hfc.getConfigSetting('network-config');

let invoke = require('../lib-fabric/invoke-transaction.js');
// let query  = require('../lib-fabric/query.js');

// config
var config = require('../config.json');
const USERNAME = config.user.username;

module.exports = {
  init: init,
    listen: listen
};
/**
 * @param {Server} io
 * @param {object} options
 */
function listen(io, options){
    var ORG = options.org;

    var orgConfig = networkConfig[ORG];
    if(!orgConfig){
        throw new Error('No such organisation in config: '+ORG);
    }

    var PEERS = Object.keys(orgConfig).filter(k=>k.startsWith('peer'));
    var peersAddress = PEERS.map(p=>tools.getHost(networkConfig[ORG][p].requests));
    var endorsePeerId = PEERS[0];
    var endorsePeerHost = tools.getHost(orgConfig[endorsePeerId].requests);

    peerListener.registerBlockEvent(function (block) {
        try {
            initProduct();
            block.data.data.forEach(blockData => {

                let type = getTransactionType(blockData);
                let channel = getTransactionChannel(blockData);

                logger.info(`got block no. ${block.header.number}: ${type} on channel ${channel}`);

                if (type === TYPE_ENDORSER_TRANSACTION) {

                    // blockData.payload.data.actions.forEach(action => {
                    //     let extension = action.payload.action.proposal_response_payload.extension;
                    //     let event = extension.events;
                    //     if(!event.event_name) {
                    //         return;
                    //     }
                    //     logger.trace(`event ${event.event_name}`);
                    //
                    //     if(event.event_name === 'Instruction.matched' || event.event_name === 'Instruction.rollbackInitiated') {
                    //         // instruction is matched, so we should move the values within 'book' cc
                    //         var instruction = JSON.parse(event.payload.toString());
                    //         logger.trace(event.event_name, JSON.stringify(instruction));
                    //
                    //         instruction = helper.normalizeInstruction(instruction);
                    //         moveBookByInstruction(instruction);
                    //         return;
                    //     }
                    //
                    //     if(channel === 'depository' && (event.event_name === 'Instruction.executed' || event.event_name === 'Instruction.rollbackDone')) {
                    //         // instruction is executed, however still has 'matched' status in ledger (but 'executed' in the event)
                    //         var instruction = JSON.parse(event.payload.toString());
                    //         logger.trace(event.event_name, JSON.stringify(instruction));
                    //
                    //         instruction = helper.normalizeInstruction(instruction);
                    //         updateInstructionStatus(instruction, instruction.status /* 'executed' */);
                    //         return;
                    //     }
                    //
                    //
                    //     logger.trace('Event not processed:', event.event_name);
                    // }); // thru action elements
                    //
                    //
                    // //TODO this updates all positions on any new block on book channel. Better if this is done only on startup.
                    // // Book can emit move event with payload of updated Positions, then you don't have to query Book
                    // if(channel === 'depository') {
                    //     updatePositionsFromBook();
                    // }
                }
            }); // thru block data elements
        }
        catch(e) {
            logger.error('Caught while processing block event', e);
        }
    });

    function getTransactionType(blockData) {
        return blockData.payload.header.channel_header.type;
    }


    function getTransactionChannel(blockData) {
        return blockData.payload.header.channel_header.channel_id;
    }

    function getBlockActionEvent(blockDataAction) {
        return blockDataAction.payload.action.proposal_response_payload.extension.events;
    }

    function initProduct() {
        // logger.debug('invoking book move %s for %s', instruction.quantity, instruction2string(instruction));

        //
        // var args = instructionArguments(instruction);
        // var operation = instruction.status === INSTRUCTION_ROLLBACK_INITATED_STATUS ? 'rollback' : 'move';
        return invoke.invokeChaincode([endorsePeerHost], 'common', 'reference', 'initProduct', ["CreateFromInvokeChaincode", "Test", "1", "a", "1530777939"], USERNAME, ORG)
            .then(function (/*transactionId*/) {
                logger.info('Move book record success');
            })
            .catch(function(e) {
                // const err = helper.parseFabricError(e)
                // // console.log('**********************************************');
                // // console.log(err, err.message, err.code, err.status);
                // if(err.code == 202 /*'Already executed.'*/ ){
                //     // assume it's not an error
                //     if (instruction.status === INSTRUCTION_ROLLBACK_INITATED_STATUS) {
                //         return updateInstructionStatus(instruction, 'rollbackDone');
                //     } else {
                //         return updateInstructionStatus(instruction, 'executed');
                //     }
                // }
                //
                // throw err;
            })
            .catch(function(e) {
                logger.error('Move book record error', e);
                // if (instruction.status === INSTRUCTION_ROLLBACK_INITATED_STATUS) {
                //     return updateInstructionStatus(instruction, 'rollbackDeclined');
                // } else {
                //     return updateInstructionStatus(instruction, 'declined');
                // }

            });
    }

}
/**
 * @param {Server} io
 * @param {object} options
 */
function init(io, options){
  var ORG = options.org;

  var orgConfig = networkConfig[ORG];
  if(!orgConfig){
    throw new Error('No such organisation in config: '+ORG);
  }

  var PEERS = Object.keys(orgConfig).filter(k=>k.startsWith('peer'));
  var peersAddress = PEERS.map(p=>tools.getHost(networkConfig[ORG][p].requests));
    // var endorsePeerId = PEERS[0];
    // var endorsePeerHost = tools.getHost(orgConfig[endorsePeerId].requests);

  // log connections
  io.on('connection', function(socket){
    logger.debug('a new user connected:', socket.id);
    socket.on('disconnect', function(/*socket*/){
      logger.debug('user disconnected:', socket.id);
    });
  });

    // emit block appearance
    var lastBlock = null;
    //TODO: listen all peers, remove duplicates
    peerListener.init([peersAddress[0]], USERNAME, ORG);
    peerListener.registerBlockEvent(function(block){
        // emit globally
        lastBlock = block;
        io.emit('chainblock', block);
    });


  // note: these statuses should be matched with client status set
  peerListener.eventHub.on('disconnected', function(){ io.emit('status', 'disconnected'); });
  peerListener.eventHub.on('connecting',   function(){ io.emit('status', 'connecting');   });
  peerListener.eventHub.on('connected',    function(){ io.emit('status', 'connected');    });

  peerListener.listen();

  io.on('connection', function(socket){
    socket.emit('status', peerListener.isConnected() ? 'connected':'disconnected' );
    // if(lastBlock){
    //   socket.emit('chainblock', lastBlock);
    // }
  });


  // setInterval(function(){
  //   socket.emit('ping', Date.now() );
  // }, 5000);

    // function getTransactionType(blockData) {
    //     return blockData.payload.header.channel_header.type;
    // }
    //
    //
    // function getTransactionChannel(blockData) {
    //     return blockData.payload.header.channel_header.channel_id;
    // }

    // function getBlockActionEvent(blockDataAction) {
    //     return blockDataAction.payload.action.proposal_response_payload.extension.events;
    // }

    // function instructionArguments(instruction) {
    //     var args = [
    //         instruction.transferer.account,  // accountFrom
    //         instruction.transferer.division, // divisionFrom
    //
    //         instruction.receiver.account,    // accountTo
    //         instruction.receiver.division,   // divisionTo
    //
    //         instruction.security,            // security
    //         ''+instruction.quantity,            // quantity // TODO: fix: string parameters
    //         instruction.reference,           // reference
    //         instruction.instructionDate,     // instructionDate  (ISO)
    //         instruction.tradeDate,           // tradeDate  (ISO)
    //
    //         instruction.type                 // instruction type
    //     ];
    //
    //     if (instruction.type === 'dvp') {
    //         args.push.apply(args, [
    //             instruction.transfererRequisites.account,
    //             instruction.transfererRequisites.bic,
    //             instruction.receiverRequisites.account,
    //             instruction.receiverRequisites.bic,
    //             instruction.paymentAmount,
    //             instruction.paymentCurrency
    //         ]);
    //     }
    //     return args;
    // }

    /**
     *
     */
    // function instruction2string(instruction){
    //     // var instruction = this;
    //     return util.format('Instruction: %s/%s -> %s/%s (%s)',
    //         instruction.transferer.account,
    //         instruction.transferer.division,
    //
    //
    //         instruction.receiver.account,
    //         instruction.receiver.division,
    //
    //         // instruction.security,
    //         // instruction.quantity,
    //         instruction.reference
    //
    //         // instruction.instructionDate,
    //         // instruction.tradeDate
    //     );
    // }
  /**
   *
   */
  // function moveBookByInstruction(instruction) {
  //     // logger.debug('invoking book move %s for %s', instruction.quantity, instruction2string(instruction));
  //
  //     //
  //     var args = instructionArguments(instruction);
  //     var operation = instruction.status === INSTRUCTION_ROLLBACK_INITATED_STATUS ? 'rollback' : 'move';
  //     return invoke.invokeChaincode([endorsePeerHost], 'depository', 'book', operation, args, USERNAME, ORG)
  //         .then(function (/*transactionId*/) {
  //             logger.info('Move book record success', helper.instruction2string(instruction));
  //         })
  //         .catch(function(e) {
  //             const err = helper.parseFabricError(e)
  //             // console.log('**********************************************');
  //             // console.log(err, err.message, err.code, err.status);
  //             if(err.code == 202 /*'Already executed.'*/ ){
  //                 // assume it's not an error
  //                 if (instruction.status === INSTRUCTION_ROLLBACK_INITATED_STATUS) {
  //                     return updateInstructionStatus(instruction, 'rollbackDone');
  //                 } else {
  //                     return updateInstructionStatus(instruction, 'executed');
  //                 }
  //             }
  //
  //             throw err;
  //         })
  //         .catch(function(e) {
  //             logger.error('Move book record error', helper.instruction2string(instruction), e);
  //             if (instruction.status === INSTRUCTION_ROLLBACK_INITATED_STATUS) {
  //                 return updateInstructionStatus(instruction, 'rollbackDeclined');
  //             } else {
  //                 return updateInstructionStatus(instruction, 'declined');
  //             }
  //
  //         });
  // }

  // function initProduct() {
  //     // logger.debug('invoking book move %s for %s', instruction.quantity, instruction2string(instruction));
  //
  //     //
  //     // var args = instructionArguments(instruction);
  //     // var operation = instruction.status === INSTRUCTION_ROLLBACK_INITATED_STATUS ? 'rollback' : 'move';
  //     return invoke.invokeChaincode([endorsePeerHost], 'common', 'reference', 'initProduct', ["eeqewe55wf3", "fewewfee", "1", "a", "1530777939"], USERNAME, ORG)
  //         .then(function (/*transactionId*/) {
  //             logger.info('Move book record success');
  //         })
  //         .catch(function(e) {
  //             // const err = helper.parseFabricError(e)
  //             // // console.log('**********************************************');
  //             // // console.log(err, err.message, err.code, err.status);
  //             // if(err.code == 202 /*'Already executed.'*/ ){
  //             //     // assume it's not an error
  //             //     if (instruction.status === INSTRUCTION_ROLLBACK_INITATED_STATUS) {
  //             //         return updateInstructionStatus(instruction, 'rollbackDone');
  //             //     } else {
  //             //         return updateInstructionStatus(instruction, 'executed');
  //             //     }
  //             // }
  //             //
  //             // throw err;
  //         })
  //         .catch(function(e) {
  //             logger.error('Move book record error', e);
  //             // if (instruction.status === INSTRUCTION_ROLLBACK_INITATED_STATUS) {
  //             //     return updateInstructionStatus(instruction, 'rollbackDeclined');
  //             // } else {
  //             //     return updateInstructionStatus(instruction, 'declined');
  //             // }
  //
  //         });
  // }
  //
  //   function queryProductByOwner(prodName = "", Org = "") {
  //       logger.debug('queryProductByOwner');
  //
  //       return query.queryChaincode(endorsePeerId, 'common', 'reference', [prodName, Org], 'queryProductByOwner', USERNAME, ORG)
  //           .then(response=>response.result)
  //           .then(function (result) {
  //               logger.debug('Query book success', JSON.stringify(result));
  //
  //               // return chainPromise(result, position => {
  //               //     logger.trace('Update position', JSON.stringify(position));
  //               //
  //               //     let org = configHelper.getOrgByAccount(position.balance.account, position.balance.division);
  //               //     if(!org) {
  //               //         logger.error('Cannot find org for position', JSON.stringify(position));
  //               //         throw new Error('Cannot find org');
  //               //     }
  //               //
  //               //     //  TODO: rename this bilateral channel
  //               //     let channel = 'nsd-' + org;
  //               //     logger.debug(`invoking position on ${channel} to put ${position.quantity} of ${position.security} to ${position.balance.account}/${position.balance.division}`);
  //               //
  //               //     //
  //               //     var args = [
  //               //         position.balance.account,
  //               //         position.balance.division,
  //               //         position.security,
  //               //         '' + position.quantity
  //               //     ];
  //               //     return invoke.invokeChaincode([endorsePeerHost], channel, 'position', 'put', args, USERNAME, ORG)
  //               //         .then(function (/*transactionId*/) {
  //               //             logger.info('Put position success', helper.position2string(position));
  //               //         })
  //               //         .catch(function (e) {
  //               //             logger.error('Put position error', helper.position2string(position), e);
  //               //             // throw e;
  //               //         });
  //               //
  //               // });
  //           })
  //           .then(()=>true)
  //           .catch(function (e) {
  //               logger.error('Cannot query Product By Owner', e);
  //               return false;
  //           });
  //   }
}