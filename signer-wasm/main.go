//go:build js && wasm

package main

import (
	"fmt"
	"strings"
	"syscall/js"

	"github.com/elliottech/lighter-go/client"
	"github.com/elliottech/lighter-go/types"
	"github.com/elliottech/lighter-go/types/txtypes"
	"github.com/ethereum/go-ethereum/common/hexutil"
)

const (
	maxAPIKeyIndex        = 254
	maxAccountIndex int64 = 281_474_976_710_654
	maxUint32       int64 = 4_294_967_295
)

var (
	activeClient      *client.TxClient
	activeChainID     uint32 = 304
	activeAPIKeyIndex uint8
	activeAccount     int64
)

func wrapErr(err error) js.Value {
	if err != nil {
		return js.ValueOf(map[string]interface{}{"error": err.Error()})
	}
	return js.ValueOf(map[string]interface{}{})
}

func recoverPanic(fn func() js.Value) (result js.Value) {
	defer func() {
		if r := recover(); r != nil {
			result = wrapErr(fmt.Errorf("panic: %v", r))
		}
	}()
	return fn()
}

func getClient(args []js.Value) (*client.TxClient, error) {
	l := len(args)
	if l < 2 {
		return nil, fmt.Errorf("missing apiKeyIndex and accountIndex")
	}

	apiKeyIndex, err := parseAPIKeyIndex(args[l-2], "apiKeyIndex")
	if err != nil {
		return nil, err
	}
	accountIndex, err := parseAccountIndex(args[l-1], "accountIndex")
	if err != nil {
		return nil, err
	}
	if activeClient == nil {
		return nil, fmt.Errorf("client is not created, call LighterCreateClient() first")
	}
	if apiKeyIndex != activeAPIKeyIndex || accountIndex != activeAccount {
		return nil, fmt.Errorf("active client mismatch for apiKeyIndex %d accountIndex %d", apiKeyIndex, accountIndex)
	}
	return activeClient, nil
}

func messageToSign(txInfo txtypes.TxInfo) string {
	if typed, ok := txInfo.(*txtypes.L2ApproveIntegratorTxInfo); ok {
		return typed.GetL1SignatureBody(activeChainID)
	}
	return ""
}

func convertTxInfoToJS(info txtypes.TxInfo, err error) js.Value {
	if err != nil {
		return wrapErr(err)
	}
	if info == nil {
		return js.ValueOf(map[string]interface{}{"error": "nil response"})
	}

	txInfo, err := info.GetTxInfo()
	if err != nil {
		return wrapErr(err)
	}

	out := map[string]interface{}{
		"txType": info.GetTxType(),
		"txInfo": txInfo,
		"txHash": info.GetTxHash(),
	}
	if msg := messageToSign(info); msg != "" {
		out["messageToSign"] = msg
	}
	return js.ValueOf(out)
}

func txAttributesWithSkipNonce(skipNonce uint8) *types.L2TxAttributes {
	attr := &types.L2TxAttributes{}
	if skipNonce == 1 {
		attr.SkipNonce = &skipNonce
	}
	return attr
}

func parseAPIKeyIndex(value js.Value, name string) (uint8, error) {
	parsed := value.Int()
	if parsed < 0 || parsed > maxAPIKeyIndex {
		return 0, fmt.Errorf("%s must be an integer from 0 to %d", name, maxAPIKeyIndex)
	}
	return uint8(parsed), nil
}

func parseAccountIndex(value js.Value, name string) (int64, error) {
	parsed := int64(value.Int())
	if parsed < 0 || parsed > maxAccountIndex {
		return 0, fmt.Errorf("%s must be an integer from 0 to %d", name, maxAccountIndex)
	}
	return parsed, nil
}

func parseUint32(value js.Value, name string) (uint32, error) {
	parsed := int64(value.Int())
	if parsed < 0 || parsed > maxUint32 {
		return 0, fmt.Errorf("%s must be an integer from 0 to %d", name, maxUint32)
	}
	return uint32(parsed), nil
}

func clearClient() {
	activeClient = nil
	activeChainID = 304
	activeAPIKeyIndex = 0
	activeAccount = 0
}

func main() {
	js.Global().Set("LighterCreateClient", js.FuncOf(func(_ js.Value, args []js.Value) interface{} {
		return recoverPanic(func() js.Value {
			if len(args) < 5 {
				return js.ValueOf(map[string]interface{}{"error": "LighterCreateClient expects url, privateKey, chainId, apiKeyIndex, accountIndex"})
			}

			privateKey := args[1].String()
			chainID, err := parseUint32(args[2], "chainId")
			if err != nil {
				return wrapErr(err)
			}
			apiKeyIndex, err := parseAPIKeyIndex(args[3], "apiKeyIndex")
			if err != nil {
				return wrapErr(err)
			}
			accountIndex, err := parseAccountIndex(args[4], "accountIndex")
			if err != nil {
				return wrapErr(err)
			}

			clearClient()
			txClient, err := client.NewTxClient(nil, privateKey, accountIndex, apiKeyIndex, chainID)
			if err == nil {
				activeClient = txClient
				activeChainID = chainID
				activeAPIKeyIndex = apiKeyIndex
				activeAccount = accountIndex
			}
			return wrapErr(err)
		})
	}))

	js.Global().Set("LighterClearClient", js.FuncOf(func(_ js.Value, _ []js.Value) interface{} {
		return recoverPanic(func() js.Value {
			clearClient()
			return wrapErr(nil)
		})
	}))

	js.Global().Set("LighterGetPublicKey", js.FuncOf(func(_ js.Value, args []js.Value) interface{} {
		return recoverPanic(func() js.Value {
			if len(args) < 2 {
				return js.ValueOf(map[string]interface{}{"error": "LighterGetPublicKey expects apiKeyIndex, accountIndex"})
			}
			c, err := getClient(args)
			if err != nil {
				return wrapErr(err)
			}
			publicKeyBytes := c.GetKeyManager().PubKeyBytes()
			publicKey := strings.TrimPrefix(hexutil.Encode(publicKeyBytes[:]), "0x")
			return js.ValueOf(map[string]interface{}{"publicKey": publicKey})
		})
	}))

	js.Global().Set("LighterSignApproveIntegrator", js.FuncOf(func(_ js.Value, args []js.Value) interface{} {
		return recoverPanic(func() js.Value {
			if len(args) < 10 {
				return js.ValueOf(map[string]interface{}{"error": "LighterSignApproveIntegrator expects integratorIndex, maxPerpsTakerFee, maxPerpsMakerFee, maxSpotTakerFee, maxSpotMakerFee, approvalExpiry, skipNonce, nonce, apiKeyIndex, accountIndex"})
			}

			c, err := getClient(args)
			if err != nil {
				return wrapErr(err)
			}

			integratorAccountIndex, err := parseAccountIndex(args[0], "integratorIndex")
			if err != nil {
				return wrapErr(err)
			}
			maxPerpsTakerFee, err := parseUint32(args[1], "maxPerpsTakerFee")
			if err != nil {
				return wrapErr(err)
			}
			maxPerpsMakerFee, err := parseUint32(args[2], "maxPerpsMakerFee")
			if err != nil {
				return wrapErr(err)
			}
			maxSpotTakerFee, err := parseUint32(args[3], "maxSpotTakerFee")
			if err != nil {
				return wrapErr(err)
			}
			maxSpotMakerFee, err := parseUint32(args[4], "maxSpotMakerFee")
			if err != nil {
				return wrapErr(err)
			}
			skipNonce := args[6].Int()
			if skipNonce < 0 || skipNonce > 1 {
				return wrapErr(fmt.Errorf("skipNonce must be 0 or 1"))
			}

			req := &types.ApproveIntegratorTxReq{
				IntegratorAccountIndex: integratorAccountIndex,
				MaxPerpsTakerFee:       maxPerpsTakerFee,
				MaxPerpsMakerFee:       maxPerpsMakerFee,
				MaxSpotTakerFee:        maxSpotTakerFee,
				MaxSpotMakerFee:        maxSpotMakerFee,
				ApprovalExpiry:         int64(args[5].Int()),
			}

			opts := &types.TransactOpts{
				TxAttributes: txAttributesWithSkipNonce(uint8(skipNonce)),
			}
			nonce := int64(args[7].Int())
			if nonce != -1 {
				opts.Nonce = &nonce
			}

			tx, err := c.GetApproveIntegratorTx(req, opts)
			return convertTxInfoToJS(tx, err)
		})
	}))

	select {}
}
