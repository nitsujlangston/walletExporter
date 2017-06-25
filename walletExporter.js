var async = require('async');
var _ = require('underscore');
var rpc = require('./lib/rpc');
var commander = require('commander');

commander
  .description('wallet exporter')
  .usage('<walletFile> <startHeight> <endHeight>')
  .parse(process.argv);

if(commander.args.length !== 3){
  commander.help();
}

var walletFile = commander.args[0];
var startHeight = parseInt(commander.args[1]);
var endHeight = parseInt(commander.args[2]);

function listTransactions(height, callback){
  rpc.getBlockByHeight(height, function(err, block){
    if (err){
      return callback(err);
    }
    async.eachSeries(block.tx, function(txid, cb){
      rpc.getTransaction(txid, function(err, transaction){
        if (err) {
          return callback(err);
        }
        var inputs = [];
        var outputs = [];
        async.series([
          function ingestInputs(done){
            async.eachSeries(transaction.vin, function (vin, vinCb) {
              if (vin.coinbase) {
                inputs.push({ type: 'coinbase' });
                return vinCb();
              }
              rpc.getTransaction(vin.txid, function(err, vinTx){
                if (err) {
                  return callback(err);
                }
                var utxo = vinTx.vout[vin.vout];
                if (utxo.scriptPubKey.addresses) {
                  inputs.push({ address: utxo.scriptPubKey.addresses[0], value: (utxo.value*1e8).toFixed(0) });
                }

                return vinCb();
              });
            }, done);
          },
          function ingestOutputs(done){
            transaction.vout.forEach(function(vout){
              if (vout.scriptPubKey.addresses){
                outputs.push({ address: vout.scriptPubKey.addresses[0], value: (vout.value*1e8).toFixed(0) });
              }
            });
            done();
          }
        ], function(){
          var sendingTransaction = false;
          _.each(inputs, function(input){
            if (_.contains(walletAddresses, input.address)){
              sendingTransaction = true;
              console.log({height: height, txid:txid, category:'sent', address: input.address, satoshis: -input.value});
            }
          });
          if (sendingTransaction){
            var totalInputValue = _.reduce(inputs, function (memo, input) { return memo + input.value; }, 0);
            var totalOutputValue = _.reduce(outputs, function (memo, output) { return memo + output.value; }, 0);
            console.log({ height: height, txid: txid, category: 'fee', satoshis: totalOutputValue - totalInputValue });
          }
          _.each(outputs, function (output) {
            if (_.contains(walletAddresses, output.address)) {
              console.log({ height: height, txid: txid, category: 'received', address: output.address, satoshis:output.value });
            }
          });

          cb();
        });
      });
    }, callback);
  });
}

var walletAddresses = require(walletFile);
walletAddresses = _.pluck(walletAddresses.keys, 'address');

async.eachSeries(_.range(startHeight, endHeight +1), function (height, cb) {
  listTransactions(height, cb);
}, function (err) {
  if (err) {
    console.error(err);
  }
});
