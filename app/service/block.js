const {Service} = require('egg')

class BlockService extends Service {
  async getBlock(arg) {
    const {Header, Address, Block, Transaction} = this.ctx.model
    let filter
    if (Number.isInteger(arg)) {
      filter = {height: arg}
    } else if (Buffer.isBuffer(arg)) {
      filter = {hash: arg}
    } else {
      return null
    }
    let result = await Header.findOne({
      where: filter,
      include: [{
        model: Block,
        as: 'block',
        required: true,
        attributes: ['size', 'weight'],
        include: [{
          model: Address,
          as: 'miner',
          attributes: ['string']
        }]
      }],
      transaction: this.ctx.state.transaction
    })
    if (!result) {
      return null
    }
    let [prevHeader, nextHeader, transactions, [reward]] = await Promise.all([
      Header.findOne({
        where: {height: result.height - 1},
        attributes: ['timestamp'],
        transaction: this.ctx.state.transaction
      }),
      Header.findOne({
        where: {height: result.height + 1},
        attributes: ['hash'],
        transaction: this.ctx.state.transaction
      }),
      Transaction.findAll({
        where: {blockHeight: result.height},
        attributes: ['id'],
        order: [['indexInBlock', 'ASC']],
        transaction: this.ctx.state.transaction
      }),
      this.getBlockRewards(result.height)
    ])
    return {
      hash: result.hash,
      height: result.height,
      version: result.version,
      prevHash: result.prevHash,
      nextHash: nextHeader && nextHeader.hash,
      merkleRoot: result.merkleRoot,
      timestamp: result.timestamp,
      bits: result.bits,
      nonce: result.nonce,
      hashStateRoot: result.hashStateRoot,
      hashUTXORoot: result.hashUTXORoot,
      stakePrevTxId: result.stakePrevTxId,
      stakeOutputIndex: result.stakeOutputIndex,
      signature: result.signature,
      chainwork: result.chainwork,
      proofOfStake: result.isProofOfStake(),
      interval: result.height > 0 ? result.timestamp - prevHeader.timestamp : null,
      size: result.block.size,
      weight: result.block.weight,
      transactions: transactions.map(tx => tx.id),
      miner: result.block.miner.string,
      difficulty: result.difficulty,
      reward,
      confirmations: this.app.blockchainInfo.tip.height - result.height + 1
    }
  }

  async getRawBlock(arg) {
    const {Header, Transaction} = this.ctx.model
    const {Header: RawHeader, Block: RawBlock} = this.app.alveyinfo.lib
    let filter
    if (Number.isInteger(arg)) {
      filter = {height: arg}
    } else if (Buffer.isBuffer(arg)) {
      filter = {hash: arg}
    } else {
      return null
    }
    let block = await Header.findOne({where: filter, transaction: this.ctx.state.transaction})
    if (!block) {
      return null
    }
    let transactionIds = (await Transaction.findAll({
      where: {blockHeight: block.height},
      attributes: ['id'],
      order: [['indexInBlock', 'ASC']],
      transaction: this.ctx.state.transaction
    })).map(tx => tx.id)
    let transactions = await Promise.all(transactionIds.map(id => this.ctx.service.transaction.getRawTransaction(id)))
    return new RawBlock({
      header: new RawHeader({
        version: block.version,
        prevHash: block.prevHash,
        merkleRoot: block.merkleRoot,
        timestamp: block.timestamp,
        bits: block.bits,
        nonce: block.nonce,
        hashStateRoot: block.hashStateRoot,
        hashUTXORoot: block.hashUTXORoot,
        stakePrevTxId: block.stakePrevTxId,
        stakeOutputIndex: block.stakeOutputIndex,
        signature: block.signature
      }),
      transactions
    })
  }

  async listBlocks(dateFilter) {
    const db = this.ctx.model
    const {sql} = this.ctx.helper
    let dateFilterString = ''
    if (dateFilter) {
      dateFilterString = sql`AND timestamp BETWEEN ${dateFilter.min} AND ${dateFilter.max - 1}`
    }
    let [{totalCount}] = await db.query(sql`
      SELECT COUNT(*) AS totalCount FROM header WHERE height <= ${this.app.blockchainInfo.tip.height} ${{raw: dateFilterString}}
    `, {type: db.QueryTypes.SELECT, transaction: this.ctx.state.transaction})
    let blocks
    if (this.ctx.state.pagination) {
      let {limit, offset} = this.ctx.state.pagination
      blocks = await db.query(sql`
        SELECT
          header.hash AS hash, l.height AS height, header.timestamp AS timestamp,
          block.size AS size, address.string AS miner
        FROM (
          SELECT height FROM header
          WHERE height <= ${this.app.blockchainInfo.tip.height} ${{raw: dateFilterString}}
          ORDER BY height DESC
          LIMIT ${offset}, ${limit}
        ) l, header, block, address
        WHERE l.height = header.height AND l.height = block.height AND address._id = block.miner_id
        ORDER BY l.height ASC
      `, {type: db.QueryTypes.SELECT, transaction: this.ctx.state.transaction})
    } else { 
      blocks = await db.query(sql`
        SELECT
          header.hash AS hash, l.height AS height, header.timestamp AS timestamp,
          block.size AS size, address.string AS miner
        FROM (
          SELECT height FROM header
          WHERE height <= ${this.app.blockchainInfo.tip.height} ${{raw: dateFilterString}}
          ORDER BY height DESC
        ) l, header, block, address
        WHERE l.height = header.height AND l.height = block.height AND address._id = block.miner_id
        ORDER BY l.height ASC
      `, {type: db.QueryTypes.SELECT, transaction: this.ctx.state.transaction})
    }
    if (blocks.length === 0) {
      return {totalCount, blocks: []}
    } else {
      return {totalCount, blocks: await this.getBlockSummary(blocks)}
    }
  }

  async getRecentBlocks(count) {
    const db = this.ctx.model
    const {sql} = this.ctx.helper
    let blocks = await db.query(sql`
      SELECT
        l.hash AS hash, l.height AS height, header.timestamp AS timestamp,
        l.size AS size, address.string AS miner
      FROM (
        SELECT hash, height, size, miner_id FROM block
        ORDER BY height DESC
        LIMIT ${count}
      ) l, header, address WHERE l.height = header.height AND l.miner_id = address._id
      ORDER BY l.height DESC
    `, {type: db.QueryTypes.SELECT, transaction: this.ctx.state.transaction})
    if (blocks.length === 0) {
      return []
    }
    blocks.reverse()
    return await this.getBlockSummary(blocks)
  }

  async getBlockRewards(startHeight, endHeight = startHeight + 1) {
    const db = this.ctx.model
    const {sql} = this.ctx.helper
    let rewards = await db.query(sql`
      SELECT SUM(value) AS value FROM (
        SELECT tx.block_height AS height, output.value AS value FROM header, transaction tx, transaction_output output
        WHERE
          tx.block_height BETWEEN ${startHeight} AND ${endHeight - 1}
          AND header.height = tx.block_height
          AND tx.index_in_block = (SELECT CASE header.stake_prev_transaction_id WHEN ${Buffer.alloc(32)} THEN 0 ELSE 1 END)
          AND output.transaction_id = tx._id
          AND NOT EXISTS (
            SELECT refund_id FROM gas_refund
            WHERE refund_id = output.transaction_id AND refund_index = output.output_index
          )
        UNION ALL
        SELECT tx.block_height AS height, -input.value AS value
        FROM header, transaction tx, transaction_input input
        WHERE
          tx.block_height BETWEEN ${startHeight} AND ${endHeight - 1}
          AND header.height = tx.block_height
          AND tx.index_in_block = (SELECT CASE header.stake_prev_transaction_id WHEN ${Buffer.alloc(32)} THEN 0 ELSE 1 END)
          AND input.transaction_id = tx._id
      ) block_reward
      GROUP BY height
      ORDER BY height ASC
    `, {type: db.QueryTypes.SELECT, transaction: this.ctx.state.transaction})
    let result = rewards.map(reward => BigInt(reward.value))
    if (startHeight[0] === 0) {
      result[0] = 0n
    }
    return result
  }

  async getBlockSummary(blocks) {
    const db = this.ctx.model
    const {Header} = db
    const {sql} = this.ctx.helper
    let transactionCountMapping = new Map(
      (await db.query(sql`
        SELECT block.height AS height, MAX(transaction.index_in_block) + 1 AS transactionsCount
        FROM block
        INNER JOIN transaction ON block.height = transaction.block_height
        WHERE block.height BETWEEN ${blocks[0].height} AND ${blocks[blocks.length - 1].height}
        GROUP BY block.height
      `, {type: db.QueryTypes.SELECT, transaction: this.ctx.state.transaction}))
        .map(({height, transactionsCount}) => [height, transactionsCount])
    )
    let [prevHeader, rewards] = await Promise.all([
      Header.findOne({
        where: {height: blocks[0].height - 1},
        attributes: ['timestamp'],
        transaction: this.ctx.state.transaction
      }),
      this.getBlockRewards(blocks[0].height, blocks[blocks.length - 1].height + 1)
    ])
    let result = []
    for (let i = blocks.length; --i >= 0;) {
      let block = blocks[i]
      let interval
      if (i === 0) {
        interval = prevHeader ? block.timestamp - prevHeader.timestamp : null
      } else {
        interval = block.timestamp - blocks[i - 1].timestamp
      }
      result.push({
        hash: block.hash,
        height: block.height,
        timestamp: block.timestamp,
        transactionsCount: transactionCountMapping.get(block.height),
        interval,
        size: block.size,
        miner: block.miner,
        reward: rewards[i]
      })
    }
    return result
  }

  async getBiggestMiners(lastNBlocks) {
    const fromBlock = this.app.chain.lastPoWBlockHeight >= 0xffffffff ? this.app.chain.lastPoWBlockHeight : 1
    const db = this.ctx.model
    const {sql} = this.ctx.helper
    const {Block} = db
    const {gte: $gte} = this.app.Sequelize.Op
    let fromBlockHeight = lastNBlocks == null ? fromBlock : Math.max(this.app.blockchainInfo.height - lastNBlocks + 1, fromBlock)
    let {limit, offset} = this.ctx.state.pagination
    let totalCount = await Block.count({
      where: {height: {[$gte]: fromBlockHeight}},
      distinct: true,
      col: 'minerId',
      transaction: this.ctx.state.transaction
    })
    let list = await db.query(sql`
      SELECT address.string AS address, list.blocks AS blocks, rich_list.balance AS balance FROM (
        SELECT miner_id, COUNT(*) AS blocks FROM block
        WHERE height >= ${fromBlockHeight}
        GROUP BY miner_id
        ORDER BY blocks DESC
        LIMIT ${offset}, ${limit}
      ) list
      INNER JOIN address ON address._id = list.miner_id
      LEFT JOIN rich_list ON rich_list.address_id = address._id
      ORDER BY blocks DESC
    `, {type: db.QueryTypes.SELECT, transaction: this.ctx.state.transaction})
    return {
      totalCount,
      list: list.map(({address, blocks, balance}) => ({address, blocks, balance: BigInt(balance || 0)}))
    }
  }

  async getBlockTransactions(height) {
    const {Transaction} = this.ctx.model
    let transactions = await Transaction.findAll({
      where: {blockHeight: height},
      attributes: ['id'],
      transaction: this.ctx.state.transaction
    })
    return transactions.map(tx => tx.id)
  }

  async getBlockAddressTransactions(height) {
    const {Address, Transaction, BalanceChange, EvmReceipt: EVMReceipt, EvmReceiptLog: EVMReceiptLog, Contract} = this.ctx.model
    const {Address: RawAddress} = this.app.alveyinfo.lib
    const TransferABI = this.app.alveyinfo.lib.Solidity.arc20ABIs.find(abi => abi.name === 'Transfer')
    let result = []
    let balanceChanges = await BalanceChange.findAll({
      attributes: [],
      include: [
        {
          model: Transaction,
          as: 'transaction',
          required: true,
          where: {blockHeight: height},
          attributes: ['indexInBlock']
        },
        {
          model: Address,
          as: 'address',
          required: true,
          attributes: ['string']
        }
      ]
    })
    for (let {transaction, address} of balanceChanges) {
      result[transaction.indexInBlock] = result[transaction.indexInBlock] || new Set()
      result[transaction.indexInBlock].add(address.string)
    }
    let receipts = await EVMReceipt.findAll({
      where: {blockHeight: height},
      attributes: ['indexInBlock', 'senderType', 'senderData']
    })
    for (let {indexInBlock, senderType, senderData} of receipts) {
      result[indexInBlock] = result[indexInBlock] || new Set()
      result[indexInBlock].add(new RawAddress({type: senderType, data: senderData, chain: this.app.chain}).toString())
    }
    let receiptLogs = await EVMReceiptLog.findAll({
      attributes: ['topic1', 'topic2', 'topic3', 'topic4'],
      include: [
        {
          model: EVMReceipt,
          as: 'receipt',
          required: true,
          where: {blockHeight: height},
          attributes: ['indexInBlock']
        },
        {
          model: Contract,
          as: 'contract',
          required: true,
          attributes: ['addressString', 'type']
        }
      ]
    })
    for (let {topic1, topic2, topic3, topic4, receipt, contract} of receiptLogs) {
      let set = result[receipt.indexInBlock] = result[receipt.indexInBlock] || new Set()
      set.add(contract.addressString)
      if (Buffer.compare(topic1, TransferABI.id) === 0 && topic3) {
        if (contract.type === 'arc20' && !topic4 || contract.type === 'arc721' && topic4) {
          let sender = topic2.slice(12)
          let receiver = topic3.slice(12)
          if (Buffer.compare(sender, Buffer.alloc(20)) !== 0) {
            set.add(new RawAddress({type: Address.PAY_TO_PUBLIC_KEY_HASH, data: sender, chain: this.app.chain}).toString())
            set.add(new RawAddress({type: Address.EVM_CONTRACT, data: sender, chain: this.app.chain}).toString())
          }
          if (Buffer.compare(receiver, Buffer.alloc(20)) !== 0) {
            set.add(new RawAddress({type: Address.PAY_TO_PUBLIC_KEY_HASH, data: receiver, chain: this.app.chain}).toString())
            set.add(new RawAddress({type: Address.EVM_CONTRACT, data: receiver, chain: this.app.chain}).toString())
          }
        }
      }
    }
    return result
  }

  getBlockFilter(category = 'blockHeight') {
    const {gte: $gte, lte: $lte, between: $between} = this.app.Sequelize.Op
    let {fromBlock, toBlock} = this.ctx.state
    let blockFilter = null
    if (fromBlock != null && toBlock != null) {
      blockFilter = {[$between]: [fromBlock, toBlock]}
    } else if (fromBlock != null) {
      blockFilter = {[$gte]: fromBlock}
    } else if (toBlock != null) {
      blockFilter = {[$lte]: toBlock}
    }
    return blockFilter ? {[category]: blockFilter} : {}
  }

  getRawBlockFilter(category = 'block_height') {
    const {sql} = this.ctx.helper
    let {fromBlock, toBlock} = this.ctx.state
    let blockFilter = 'TRUE'
    if (fromBlock != null && toBlock != null) {
      blockFilter = sql`${{raw: category}} BETWEEN ${fromBlock} AND ${toBlock}`
    } else if (fromBlock != null) {
      blockFilter = sql`${{raw: category}} >= ${fromBlock}`
    } else if (toBlock != null) {
      blockFilter = sql`${{raw: category}} <= ${toBlock}`
    }
    return {raw: blockFilter}
  }
}

module.exports = BlockService
