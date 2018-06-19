/**
 * Created by maksim on 7/13/17.
 */
/**
 * @class QueryController
 * @ngInject
 */
function QueryController($scope, ChannelService, ConfigLoader, $log, $q) {
  var ctl = this;

  ctl.channels = [];
  ctl.chaincodes = [];
  ctl.transaction = null;
  ctl.invokeInProgress = false;

  // init
  var orgs = ConfigLoader.getOrgs();
  ctl.myAssets = ConfigLoader.getAssets('my');

  ctl.Assets = ConfigLoader.getAssets('all');
  $scope.sortType     = 'owner'; // set the default sort type
  $scope.sortReverse  = false;  // set the default sort order
  $scope.searchFish   = '';

  var allPeers = [];
  orgs.forEach(function(org){
    var peers = ConfigLoader.getPeers(org.id);
    allPeers.push.apply(allPeers, peers);
  });

  // allPeers = JSON.parse(JSON.stringify(allPeers));
  // allPeers.unshift({
  //   "server-hostname": "Select peers"
  // });


  ctl.getPeers = function(){
    return allPeers;
  };

  ctl.getChannels = function(){
    return ChannelService.list().then(function(dataList){
      ctl.channels = dataList;
    });
  };

  ctl.getChaincodes = function(){
    if(!$scope.selectedChannel){
      return $q.resolve([]);
    }
    return ChannelService.listChannelChaincodes($scope.selectedChannel.channel_id).then(function(dataList){
      ctl.chaincodes = dataList;
    });
  };

  ctl.add = function(product, description){
    ctl.arg = [];

    ctl.arg['Name']  = product;
    ctl.arg['Desc']  = description;
    ctl.arg['State'] = 'Register';
    ctl.arg['Org']   = ConfigLoader.get().org;

    ctl.channel  = Object.create({}, { channel_id: { value: 'common'} });;
    ctl.chaincode =  Object.create({}, { name: { value: 'reference'} });
    ctl.peers = [''+ctl.arg['Org']+'/peer0", "'+ctl.arg['Org']+'/peer1'];
    ctl.peers = ['a/peer0', 'a/peer1'];

    ctl.fcn ='add';

    ctl.invoke(ctl.channel, ctl.chaincode, ctl.peers, ctl.fcn, '["'+ctl.arg['Name']+'","'+ctl.arg['Desc']+'", "'+ctl.arg['State']+'", "'+ctl.arg['Org']+'"]');
  }

  ctl.invoke = function(channel, cc, peers, fcn, args){
    try{
      args = JSON.parse(args);
    }catch(e){
      $log.warn(e);
    }

    ctl.transaction = null;
    ctl.error = null;
    ctl.invokeInProgress = true;

    return ChannelService.invoke(channel.channel_id, cc.name, peers, fcn, args)
      .then(function(data){
        return ChannelService.getTransactionById(channel.channel_id, data.transaction);
      })
      .then(function(transaction){
        ctl.transaction = transaction;
        ctl.result = getTxResult(transaction);
      })
      .catch(function(response){
        ctl.error = response.data || response;
      })
      .finally(function(){
        ctl.invokeInProgress = false;
      });
  }

  function getTxResult(transaction){
    var result = null;
    try{
      result = {};
      // TODO: loop trough actions
      var ns_rwset = transaction.transactionEnvelope.payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset;
      ns_rwset = ns_rwset.filter(function(action){return action.namespace != "lscc"}); // filter system chaincode
      ns_rwset.forEach(function(action){
        result[action.namespace] = action.rwset.writes.reduce(function(result, element){
          result[element.key] = element.is_delete ? null : element.value;
          return result;
        }, {});

      });
    }catch(e){
      console.info(e);
      result = null
    }
    return result;
  }

  function getQTxResult(transaction){
    return transaction;
  }


  ctl.query = function(channel, cc, peer, fcn, args){
    try{
      args = JSON.parse(args);
    }catch(e){
      $log.warn(e);
    }

    ctl.transaction = null;
    ctl.error = null;
    ctl.invokeInProgress = true;

    return ChannelService.query(channel.channel_id, cc.name, peer, fcn, args)
      .then(function(transaction){
        ctl.transaction = transaction;
        ctl.result = getQTxResult(transaction);
      })
      .catch(function(response){
        ctl.error = response.data || response;
      })
      .finally(function(){
        ctl.invokeInProgress = false;
      });
  }


  //
  ctl.getChannels();
  $scope.$watch('selectedChannel', ctl.getChaincodes );




}


angular.module('nsd.controller.query', ['nsd.service.channel'])
  .controller('QueryController', QueryController);
