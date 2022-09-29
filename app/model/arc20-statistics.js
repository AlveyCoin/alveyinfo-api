module.exports = app => {
  const {INTEGER, CHAR} = app.Sequelize

  let ARC20Statistics = app.model.define('arc20_statistics', {
    contractAddress: {
      type: CHAR(20).BINARY,
      primaryKey: true
    },
    holders: INTEGER.UNSIGNED,
    transactions: INTEGER.UNSIGNED
  }, {freezeTableName: true, underscored: true, timestamps: false})

  ARC20Statistics.associate = () => {
    const {Arc20: ARC20} = app.model
    ARC20Statistics.belongsTo(ARC20, {as: 'arc20', foreignKey: 'contractAddress'})
    ARC20.hasOne(ARC20Statistics, {as: 'statistics', foreignKey: 'contractAddress'})
  }

  return ARC20Statistics
}
