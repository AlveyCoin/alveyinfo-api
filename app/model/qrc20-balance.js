module.exports = app => {
  const {CHAR} = app.Sequelize

  let ARC20Balance = app.model.define('arc20_balance', {
    contractAddress: {
      type: CHAR(20).BINARY,
      primaryKey: true
    },
    address: {
      type: CHAR(20).BINARY,
      primaryKey: true
    },
    balance: {
      type: CHAR(32).BINARY,
      get() {
        let balance = this.getDataValue('balance')
        return balance == null ? null : BigInt(`0x${balance.toString('hex')}`)
      },
      set(balance) {
        this.setDataValue(
          'balance',
          Buffer.from(balance.toString(16).padStart(64, '0'), 'hex')
        )
      }
    }
  }, {freezeTableName: true, underscored: true, timestamps: false})

  ARC20Balance.associate = () => {
    const {Contract} = app.model
    Contract.hasMany(ARC20Balance, {as: 'arc20Balances', foreignKey: 'contractAddress'})
    ARC20Balance.belongsTo(Contract, {as: 'contract', foreignKey: 'contractAddress'})
  }

  return ARC20Balance
}
