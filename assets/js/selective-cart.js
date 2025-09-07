jQuery(document).ready(function($) {
    const { ajax_url, nonce, is_cart, is_checkout, translations: t } = wccf_params;
    
    let isProcessing = false;
    let pendingUpdates = [];
    
    function init() {
        if (!is_cart || isProcessing) return;
        
        // Clean existing elements
        $('.wccf-checkbox-cell').remove();
        $('#wccf-control').remove();
        
        addCheckboxesToCartItems();
        addControlPanel();
        loadSelectionState();
        attachEvents();
        
        // Force update cart totals after state is loaded
        setTimeout(function() {
            if ($('.wccf-checkbox:not(:checked)').length > 0) {
                updateCartTotals();
            }
        }, 100);
    }
    
    function addCheckboxesToCartItems() {
        // Find cart items - support multiple structures
        let $cartItems = $('.woocommerce-cart-form__cart-item');
        
        // WoodMart theme support
        if ($cartItems.length === 0) {
            $cartItems = $('.wd-cart-item, .cart_item, tbody.woocommerce-cart-form__contents tr');
        }
        
        $cartItems.each(function() {
            const $row = $(this);
            
            // Skip if already has checkbox
            if ($row.find('.wccf-checkbox').length > 0) return;
            
            // Find remove link to get cart key
            const $removeLink = $row.find('.product-remove a, .remove, a.remove');
            const href = $removeLink.attr('href') || '';
            const match = href.match(/remove_item=([a-z0-9]+)/);
            
            if (!match) return;
            
            const cartKey = match[1];
            
            // Create checkbox
            const $td = $('<td class="wccf-checkbox-cell">');
            const $checkbox = $('<input>', {
                type: 'checkbox',
                class: 'wccf-checkbox',
                'data-cart-key': cartKey,
                checked: true
            });
            
            $td.append($checkbox);
            $row.prepend($td);
        });
    }
    
    function addControlPanel() {
        if ($('.wccf-checkbox').length === 0) return;
        
        const panel = `
            <div id="wccf-control">
                <label>
                    <input type="checkbox" id="wccf-select-all" checked>
                    <span>${t.select_all}</span>
                </label>
                <div class="wccf-counter"></div>
            </div>
        `;
        
        $('.woocommerce-cart-form').before(panel);
    }
    
    function loadSelectionState() {
        $.post(ajax_url, {
            action: 'wccf_get_selection_state',
            nonce: nonce
        }).done(response => {
            if (response.success) {
                // Apply saved state
                response.data.unselected_items.forEach(key => {
                    const $cb = $(`.wccf-checkbox[data-cart-key="${key}"]`);
                    $cb.prop('checked', false);
                    $cb.closest('tr').addClass('wccf-unselected');
                });
                updateCounter();
            }
        });
    }
    
    function updateCounter() {
        const total = $('.wccf-checkbox').length;
        const checked = $('.wccf-checkbox:checked').length;
        
        let text = `<strong>${checked}</strong> ${t.items_selected}`;
        if (total - checked > 0) {
            text += ` • <span>${total - checked} ${t.items_remaining}</span>`;
        }
        
        $('.wccf-counter').html(text);
        
        // Update select all
        $('#wccf-select-all').prop({
            checked: checked === total,
            indeterminate: checked > 0 && checked < total
        });
        
        // Update proceed button
        const $btn = $('.wc-proceed-to-checkout .checkout-button');
        if (checked === 0) {
            $btn.addClass('disabled').prop('disabled', true);
        } else {
            $btn.removeClass('disabled').prop('disabled', false);
        }
    }
    
    function updateCartTotals() {
        // Show loading on totals
        $('.cart_totals').css('opacity', '0.5');
        
        $.post(ajax_url, {
            action: 'wccf_update_cart_totals',
            nonce: nonce
        }).done(response => {
            if (response.success) {
                $('.cart_totals').replaceWith(response.data.html);
                updateCounter();
            }
        }).always(() => {
            $('.cart_totals').css('opacity', '1');
        });
    }
    
    function handleCheckboxChange($checkbox) {
        const cartKey = $checkbox.data('cart-key');
        const isChecked = $checkbox.prop('checked');
        
        // Visual update
        $checkbox.closest('tr').toggleClass('wccf-unselected', !isChecked);
        
        // Send update
        $.post(ajax_url, {
            action: 'wccf_update_selection',
            cart_item_key: cartKey,
            is_selected: isChecked,
            nonce: nonce
        }).done(response => {
            if (response.success) {
                updateCounter();
                updateCartTotals();
            }
        }).fail(() => {
            // Revert on error
            $checkbox.prop('checked', !isChecked);
            $checkbox.closest('tr').toggleClass('wccf-unselected', isChecked);
        });
    }
    
    function attachEvents() {
        // Individual checkbox
        $(document).on('change', '.wccf-checkbox', function(e) {
            e.stopPropagation();
            handleCheckboxChange($(this));
        });
        
        // Select all
        $(document).on('change', '#wccf-select-all', function() {
            const checkAll = $(this).prop('checked');
            const updates = [];
            
            $('.wccf-checkbox').each(function() {
                const $cb = $(this);
                if ($cb.prop('checked') !== checkAll) {
                    $cb.prop('checked', checkAll);
                    $cb.closest('tr').toggleClass('wccf-unselected', !checkAll);
                    
                    updates.push({
                        key: $cb.data('cart-key'),
                        selected: checkAll
                    });
                }
            });
            
            // Send all updates
            if (updates.length > 0) {
                let completed = 0;
                updates.forEach(item => {
                    $.post(ajax_url, {
                        action: 'wccf_update_selection',
                        cart_item_key: item.key,
                        is_selected: item.selected,
                        nonce: nonce
                    }).always(() => {
                        completed++;
                        if (completed === updates.length) {
                            updateCartTotals();
                        }
                    });
                });
            }
        });
        
        // Prevent checkout with no items
        $(document).on('click', '.checkout-button', function(e) {
            if ($('.wccf-checkbox:checked').length === 0) {
                e.preventDefault();
                alert(t.no_items_selected);
                return false;
            }
        });
    }
    
    // Initialize
    init();
    
    // Reinit after cart updates
    $(document.body).on('updated_cart_totals', function() {
        setTimeout(init, 100);
    });
    
    // WoodMart specific events
    $(document).on('wood-images-loaded wd-cart-reloaded', function() {
        setTimeout(init, 100);
    });
});
