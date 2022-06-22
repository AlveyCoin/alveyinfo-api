const {Controller} = require('egg')

class ARC20Controller extends Controller {
  async list() {
    const {ctx} = this
    let {totalCount, tokens} = await ctx.service.arc20.listARC20Tokens()
    ctx.body = {
      totalCount,
      tokens: tokens.map(item => ({
        address: item.addressHex.toString('hex'),
        addressHex: item.addressHex.toString('hex'),
        name: item.name,
        symbol: item.symbol,
        decimals: item.decimals,
        totalSupply: item.totalSupply.toString(),
        version: item.version,
        holders: item.holders,
        transactions: item.transactions
      }))
    }
  }

  async allTransactions() {
    const {ctx} = this
    let {totalCount, transactions} = await ctx.service.arc20.getAllARC20TokenTransactions()
    ctx.body = {
      totalCount,
      transactions: transactions.map(transaction => ({
        transactionId: transaction.transactionId.toString('hex'),
        outputIndex: transaction.outputIndex,
        blockHeight: transaction.blockHeight,
        blockHash: transaction.blockHash.toString('hex'),
        timestamp: transaction.timestamp,
        token: {
          name: transaction.token.name,
          symbol: transaction.token.symbol,
          decimals: transaction.token.decimals
        },
        from: transaction.from,
        fromHex: transaction.fromHex && transaction.fromHex.toString('hex'),
        to: transaction.to,
        toHex: transaction.toHex && transaction.toHex.toString('hex'),
        value: transaction.value.toString()
      }))
    }
  }

  async transactions() {
    const {ctx} = this
    ctx.assert(ctx.state.token.type === 'arc20', 404)
    let {totalCount, transactions} = await ctx.service.arc20.getARC20TokenTransactions(ctx.state.token.contractAddress)
    ctx.body = {
      totalCount,
      transactions: transactions.map(transaction => ({
        transactionId: transaction.transactionId.toString('hex'),
        outputIndex: transaction.outputIndex,
        blockHeight: transaction.blockHeight,
        blockHash: transaction.blockHash.toString('hex'),
        timestamp: transaction.timestamp,
        from: transaction.from,
        fromHex: transaction.fromHex && transaction.fromHex.toString('hex'),
        to: transaction.to,
        toHex: transaction.toHex && transaction.toHex.toString('hex'),
        value: transaction.value.toString()
      }))
    }
  }

  async richList() {
    const {ctx} = this
    ctx.assert(ctx.state.token.type === 'arc20', 404)
    let {totalCount, list} = await ctx.service.arc20.getARC20TokenRichList(ctx.state.token.contractAddress)
    ctx.body = {
      totalCount,
      list: list.map(item => ({
        address: item.address,
        addressHex: item.addressHex,
        balance: item.balance.toString()
      }))
    }
  }
}

module.exports = ARC20Controller
