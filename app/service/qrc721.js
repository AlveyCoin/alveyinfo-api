const {Service} = require('egg')

class ARC721Service extends Service {
  async listARC721Tokens() {
    const db = this.ctx.model
    const {sql} = this.ctx.helper
    let {limit, offset} = this.ctx.state.pagination

    let [{totalCount}] = await db.query(sql`
      SELECT COUNT(DISTINCT(arc721_token.contract_address)) AS count FROM arc721_token
      INNER JOIN arc721 USING (contract_address)
    `, {type: db.QueryTypes.SELECT, transaction: this.ctx.state.transaction})
    let list = await db.query(sql`
      SELECT
        contract.address_string AS address, contract.address AS addressHex,
        arc721.name AS name, arc721.symbol AS symbol, arc721.total_supply AS totalSupply,
        list.holders AS holders
      FROM (
        SELECT contract_address, COUNT(*) AS holders FROM arc721_token
        INNER JOIN arc721 USING (contract_address)
        GROUP BY contract_address
        ORDER BY holders DESC
        LIMIT ${offset}, ${limit}
      ) list
      INNER JOIN arc721 USING (contract_address)
      INNER JOIN contract ON contract.address = list.contract_address
      ORDER BY holders DESC
    `, {type: db.QueryTypes.SELECT, transaction: this.ctx.state.transaction})

    return {
      totalCount,
      tokens: list.map(item => ({
        address: item.addressHex.toString('hex'),
        addressHex: item.addressHex,
        name: item.name.toString(),
        symbol: item.symbol.toString(),
        totalSupply: BigInt(`0x${item.totalSupply.toString('hex')}`),
        holders: item.holders
      }))
    }
  }

  async getAllARC721Balances(hexAddresses) {
    if (hexAddresses.length === 0) {
      return []
    }
    const db = this.ctx.model
    const {sql} = this.ctx.helper
    let list = await db.query(sql`
      SELECT
        contract.address AS addressHex, contract.address_string AS address,
        arc721.name AS name,
        arc721.symbol AS symbol,
        arc721_token.count AS count
      FROM (
        SELECT contract_address, COUNT(*) AS count FROM arc721_token
        WHERE holder IN ${hexAddresses}
        GROUP BY contract_address
      ) arc721_token
      INNER JOIN contract ON contract.address = arc721_token.contract_address
      INNER JOIN arc721 ON arc721.contract_address = arc721_token.contract_address
    `, {type: db.QueryTypes.SELECT, transaction: this.ctx.state.transaction})
    return list.map(item => ({
      address: item.addressHex.toString('hex'),
      addressHex: item.addressHex,
      name: item.name.toString(),
      symbol: item.symbol.toString(),
      count: item.count
    }))
  }
}

module.exports = ARC721Service
