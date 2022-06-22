const {Service} = require('egg')

class MiscService extends Service {
  async classify(id) {
    const db = this.ctx.model
    const {Block, Transaction, Contract, Qrc20: ARC20, where, fn, literal} = db
    const {or: $or, like: $like} = this.app.Sequelize.Op
    const {Address} = this.app.alveyinfo.lib
    const {sql} = this.ctx.helper
    const transaction = this.ctx.state.transaction

    if (/^(0|[1-9]\d{0,9})$/.test(id)) {
      let height = Number.parseInt(id)
      if (height <= this.app.blockchainInfo.tip.height) {
        return {type: 'block'}
      }
    }
    if (/^[0-9a-f]{64}$/i.test(id)) {
      if (await Block.findOne({
        where: {hash: Buffer.from(id, 'hex')},
        attributes: ['height']
      })) {
        return {type: 'block'}
      } else if (await Transaction.findOne({
        where: {id: Buffer.from(id, 'hex')},
        attributes: ['_id'],
        transaction
      })) {
        return {type: 'transaction'}
      }
    }

    try {
      let address = Address.fromString(id, this.app.chain)
      if ([Address.CONTRACT, Address.EVM_CONTRACT].includes(address.type)) {
        let contract = await Contract.findOne({
          where: {address: address.data},
          attributes: ['address'],
          transaction
        })
        if (contract) {
          return {type: 'contract'}
        }
      } else {
        return {type: 'address'}
      }
    } catch (err) {}

    let arc20Results = (await ARC20.findAll({
      where: {
        [$or]: [
          where(fn('LOWER', fn('CONVERT', literal('name USING utf8mb4'))), id.toLowerCase()),
          where(fn('LOWER', fn('CONVERT', literal('symbol USING utf8mb4'))), id.toLowerCase())
        ]
      },
      attributes: ['contractAddress'],
      transaction
    })).map(arc20 => arc20.contractAddress)
    if (arc20Results.length === 0) {
      arc20Results = (await ARC20.findAll({
        where: {
          [$or]: [
            where(fn('LOWER', fn('CONVERT', literal('name USING utf8mb4'))), {[$like]: ['', ...id.toLowerCase(), ''].join('%')}),
            where(fn('LOWER', fn('CONVERT', literal('name USING utf8mb4'))), {[$like]: `%${id.toLowerCase()}%`}),
            where(fn('LOWER', fn('CONVERT', literal('symbol USING utf8mb4'))), {[$like]: ['', ...id.toLowerCase(), ''].join('%')}),
            where(fn('LOWER', fn('CONVERT', literal('symbol USING utf8mb4'))), {[$like]: `%${id.toLowerCase()}%`})
          ]
        },
        attributes: ['contractAddress'],
        transaction
      })).map(arc20 => arc20.contractAddress)
    }
    if (arc20Results.length) {
      let [{addressHex}] = await db.query(sql`
        SELECT contract.address_string AS address, contract.address AS addressHex FROM (
          SELECT contract_address FROM arc20_statistics
          WHERE contract_address IN ${arc20Results}
          ORDER BY transactions DESC LIMIT 1
        ) arc20_balance
        INNER JOIN contract ON contract.address = arc20_balance.contract_address
      `, {type: db.QueryTypes.SELECT, transaction})
      return {type: 'contract', address: addressHex.toString('hex'), addressHex: addressHex.toString('hex')}
    }

    return {}
  }

  async getPrices() {
    let apiKey = this.app.config.cmcAPIKey
    if (!apiKey) {
      return {}
    }
    const coinId = 1684
    let [USDResult, CNYResult] = await Promise.all([
      this.ctx.curl('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', {
        headers: {
          'X-CMC_PRO_API_KEY': apiKey,
          Accept: 'application/json'
        },
        data: {
          id: coinId,
          convert: 'USD'
        },
        dataType: 'json'
      }),
      this.ctx.curl('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', {
        headers: {
          'X-CMC_PRO_API_KEY': apiKey,
          Accept: 'application/json'
        },
        data: {
          id: coinId,
          convert: 'CNY'
        },
        dataType: 'json'
      })
    ])
    return {
      USD: USDResult.data.data[coinId].quote.USD.price,
      CNY: CNYResult.data.data[coinId].quote.CNY.price
    }
  }
}

module.exports = MiscService
