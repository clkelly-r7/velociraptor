import "./table.css";

import _ from 'lodash';

import './paged-table.css';

import {CancelToken} from 'axios';

import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Button from 'react-bootstrap/Button';
import Pagination from 'react-bootstrap/Pagination';
import Form from 'react-bootstrap/Form';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Navbar from 'react-bootstrap/Navbar';
import VeloValueRenderer from '../utils/value.jsx';
import Spinner from '../utils/spinner.jsx';
import api from '../core/api-service.jsx';
import VeloTimestamp from "../utils/time.jsx";
import ClientLink from '../clients/client-link.jsx';
import HexView from '../utils/hex.jsx';
import StackDialog from './stack.jsx';
import ToolTip from '../widgets/tooltip.jsx';
import Col from 'react-bootstrap/Col';
import Table from 'react-bootstrap/Table';
import Dropdown from 'react-bootstrap/Dropdown';

import T from '../i8n/i8n.jsx';
import UserConfig from '../core/user.jsx';

import {
    InspectRawJson,
    PrepareData,
} from './table.jsx';


class ColumnFilter extends Component {
    static propTypes = {
        column:  PropTypes.string,
        transform: PropTypes.object,
        setTransform: PropTypes.func,
    }

    state = {
        edit_visible: false,
        edit_filter: "",
    }

    componentDidMount = () => {
        this.updateFiltersFromTransform();
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (!_.isEqual(prevProps.transform, this.props.transform)) {
            this.updateFiltersFromTransform();
        }
    }

    updateFiltersFromTransform = () => {
        let transform = this.props.transform || {};
        let edit_filter = "";

        if(this.props.column === transform.filter_column) {
            edit_filter = transform.filter_regex;
        }
        this.setState({
            edit_filter: edit_filter,
            edit_visible: transform.editing === this.props.column,
        });
    }

    submitSearch = ()=>{
        let edit_filter = this.state.edit_filter;
        let transform = Object.assign({}, this.props.transform);
        transform.editing = "";

        if(edit_filter) {
            transform.filter_column = this.props.column;
            transform.filter_regex = this.state.edit_filter;
        } else {
            transform.filter_column = null;
            transform.filter_regex = null;
        }
        this.setState({
            edit_visible: false,
        });
        this.props.setTransform(transform);
    }

    render() {
        let classname = "hidden-edit";

        if(this.state.edit_visible) {
            return <Form onSubmit={()=>this.submitSearch()}>
                     <Form.Control
                       as="input"
                       className="visible"
                       placeholder={T("Regex")}
                       spellCheck="false"
                       value={this.state.edit_filter}
                       onChange={e=> {
                           this.setState({edit_filter: e.currentTarget.value});
                       }}/>
                   </Form>;
        }

        if (this.state.edit_filter) {
            classname = "visible";
        }

        return <Button
                 size="sm"
                 variant="outline-dark"
                 className={classname}
                 onClick={()=>{
                     this.setState({
                         edit_visible: true,
                     });
                     this.props.setTransform({editing: this.props.column});
                 }}>
                 <FontAwesomeIcon icon="filter"/>
                 { this.state.edit_filter }
               </Button>;
    }
}


class ColumnSort extends Component {
    static propTypes = {
        column:  PropTypes.string,
        transform: PropTypes.object,
        setTransform: PropTypes.func,
    }

    submitSort = next_dir=>{
        let transform = Object.assign({}, this.props.transform);
        transform.sort_column = this.props.column;
        transform.sort_direction = next_dir;;
        this.props.setTransform(transform);
    }

    render() {
        let icon = "sort";
        let next_dir = "Ascending";
        let classname = "hidden-edit";

        let sort_direction = "";
        if (this.props.transform &&
            this.props.transform.sort_column == this.props.column) {
            sort_direction = this.props.transform.sort_direction;
        }

        if (sort_direction === "Ascending") {
            icon = "arrow-up-a-z";
            next_dir = "Descending";
            classname = "visible";
        } else if (sort_direction === "Descending"){
            icon = "arrow-down-a-z";
            next_dir = "Ascending";
            classname = "visible";
        }


        return <Button
                 size="sm"
                 className={classname}
                 variant="outline-dark"
                 onClick={()=>this.submitSort(next_dir)}
               >
                 <FontAwesomeIcon icon={icon}/>
               </Button>;
    }
}


class ColumnToggle extends Component {
    static propTypes = {
        columns: PropTypes.array,
        toggles: PropTypes.object,
        onToggle: PropTypes.func,
    }

    state = {
        opened: false,
    }

    render() {
        let enabled_columns = [];

        let buttons = _.map(this.props.columns, (column, idx) => {
            if (!column) {
                return <React.Fragment key={idx}></React.Fragment>;
            }
            let hidden = this.props.toggles[column];
            if (!hidden) {
                enabled_columns.push(column);
            }
            return <Dropdown.Item
                     key={ column }
                     eventKey={column}
                     active={!hidden}
                   >
                     { column }
            </Dropdown.Item>;
        });

        return <ToolTip tooltip={T("Show/Hide Columns")}>
                 <Dropdown as={ButtonGroup}
                           show={this.state.open}
                           onSelect={this.props.onToggle}
                           onToggle={(nextOpen, metadata) => {
                               this.setState({
                                   open: metadata.source === "select" || nextOpen,
                               });
                           }}>
                   <Dropdown.Toggle variant="default" id="dropdown-basic">
                     <FontAwesomeIcon icon="columns"/>
                   </Dropdown.Toggle>

                   <Dropdown.Menu>
                     { _.isEmpty(enabled_columns) ?
                       <Dropdown.Item
                         onClick={()=>{
                             // Enable all columns
                             _.each(this.props.columns, this.props.onToggle);
                         }}>
                         {T("Set All")}
                       </Dropdown.Item> :
                       <Dropdown.Item
                         onClick={()=>{
                             // Disable all enabled columns
                             _.each(enabled_columns, this.props.onToggle);
                         }}>
                         {T("Clear All")}
                       </Dropdown.Item> }
                     <Dropdown.Divider />
                     { buttons }
                   </Dropdown.Menu>
                 </Dropdown>
               </ToolTip>;
    };
}


export class TablePaginationControl extends React.Component {
    static propTypes = {
        page_size:  PropTypes.number,
        total_size: PropTypes.number,
        current_page: PropTypes.number,
        start_row: PropTypes.number,
        onPageChange: PropTypes.func,
        onPageSizeChange: PropTypes.func,
        direction: PropTypes.string,
    }

    state = {
        goto_offset: "",
        goto_error: false,
    }

    gotoPage = page=>{
        let new_offset = page*this.props.page_size;
        this.setState({goto_offset: new_offset});
        this.props.onPageChange(page);
    }

    render() {
        let total_size = parseInt(this.props.total_size || 0);
        if (total_size <=0) {
            return <></>;
        }

        let total_pages = parseInt(total_size / this.props.page_size) + 1;
        let last_page = total_pages - 1;
        if (last_page <= 0) {
            last_page = 0;
        }

        let pages = [];
        let current_page = this.props.current_page;
        let start_page = this.props.current_page - 2;
        let end_page = this.props.current_page + 2;

        let end = this.props.start_row + this.props.page_size;
        if(end>this.props.total_size) {
            end=this.props.total_size;
        }

        if (start_page < 0) {
            end_page -= start_page;
        }

        if (end_page > last_page) {
            start_page -= end_page - last_page;
        }

        if (start_page < 0 ) {
            start_page = 0;
        }

        if( end_page > last_page) {
            end_page = last_page;
        }

        for(let i=start_page; i<end_page + 1; i++) {
            pages.push(
                <Dropdown.Item as={Button}
                               variant="default"
                               key={i}
                               active={i === this.props.current_page}
                               onClick={ () => this.props.onPageChange(i) } >
                  { i }
                </Dropdown.Item>);
        };

        let page_sizes = _.map([10, 25, 30, 50, 100], x=>{
            return <Dropdown.Item
                     as={Button}
                     variant="default"
                     key={x}
                     active={x === this.props.page_size}
                     onClick={ () => this.props.onPageSizeChange(x) } >
                     { x }
                   </Dropdown.Item>;
        });

        return (
            <>
              <Button variant="default" className="goto-start"
                      disabled={this.props.current_page===0}
                      onClick={()=>this.props.onPageChange(0)}>
                <FontAwesomeIcon icon="backward-fast"/>
              </Button>

              <Button variant="default" className="goto-prev"
                      disabled={this.props.current_page===0}
                      onClick={()=>this.props.onPageChange(
                          this.props.current_page-1)}>
                <FontAwesomeIcon icon="backward"/>
              </Button>

              <ToolTip tooltip={T("Goto Page")}>
                <Dropdown as={ButtonGroup}
                          show={this.state.open}
                          drop={this.props.direction}
                          onSelect={this.selectPage}
                          onToggle={(nextOpen, metadata) => {
                              this.setState({
                                  open: metadata.source === "select" || nextOpen,
                              });
                          }}>
                  <Dropdown.Toggle variant="default" id="dropdown-basic">
                    {T("TablePagination", this.props.start_row || 0,
                       end || 0, this.props.total_size || 0)}
                  </Dropdown.Toggle>

                  <Dropdown.Menu>
                    <Dropdown.Item className="goto-input">
                      <Form.Control
                        as="input"
                        className="pagination-form"
                        placeholder={T("Goto Page")}
                        spellCheck="false"
                        id="goto-page"
                        value={this.props.current_page || ""}
                        onChange={e=> {
                            let page = parseInt(e.currentTarget.value || 0);
                            if (page >= 0 && page < total_pages) {
                                this.props.onPageChange(page);
                            }
                        }}/>
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    { pages }
                  </Dropdown.Menu>
                </Dropdown>
              </ToolTip>

              <Button variant="default" className="goto-next"
                      disabled={this.props.current_page >= last_page}
                      onClick={()=>this.props.onPageChange(
                        this.props.current_page+1)}>
                <FontAwesomeIcon icon="forward"/>
              </Button>

              <Button variant="default" className="goto-end"
                      disabled={this.props.current_page === last_page}
                      onClick={()=>this.props.onPageChange(last_page)}>
                    <FontAwesomeIcon icon="forward-fast"/>
              </Button>

              <ToolTip tooltip={T("Page Size")}>
                <Dropdown as={ButtonGroup}
                          show={this.state.open_size}
                          drop={this.props.direction}
                          onSelect={this.selectPage}
                          onToggle={(nextOpen, metadata) => {
                              this.setState({
                                  open_size: metadata.source === "select" || nextOpen,
                              });
                          }}>
                  <Dropdown.Toggle variant="default" id="dropdown-basic">
                    {this.props.page_size || 0}
                  </Dropdown.Toggle>

                  <Dropdown.Menu>
                    { page_sizes }
                  </Dropdown.Menu>
                </Dropdown>
              </ToolTip>
            </>
        );

        // TODO: Decide which style
        return (
            <Pagination>
              <Pagination.First
                disabled={this.props.current_page===0}
                onClick={()=>this.props.onPageChange(0)}/>
              { pages }
              <Pagination.Last
                disabled={this.props.current_page === last_page}
                onClick={()=>this.props.onPageChange(last_page)}/>
              <Form.Control
                as="input"
                className="pagination-form"
                placeholder={T("Goto Page")}
                spellCheck="false"
                id="goto-page"
                value={this.props.current_page || ""}
                onChange={e=> {
                    let page = parseInt(e.currentTarget.value || 0);
                    if (page >= 0 && page < total_pages) {
                        this.props.onPageChange(page);
                    }
                }}/>
            </Pagination>
        );
    }
}


class VeloPagedTable extends Component {
    static contextType = UserConfig;

    static propTypes = {
        // Params to the GetTable API call.
        params: PropTypes.object,

        // A dict containing renderers for each column.
        renderers: PropTypes.object,

        // A unique name we use to identify this table. We use this
        // name to save column preferences in the application user
        // context.
        name: PropTypes.string,

        // The URL Handler to fetch the table content. Defaults to
        // "v1/GetTable".
        url: PropTypes.string,

        // An environment that will be passed to the column renderers
        env: PropTypes.object,

        // When called will cause the table to be recalculated.
        refresh: PropTypes.func,

        // A version to force refresh of the table.
        version: PropTypes.object,

        translate_column_headers: PropTypes.bool,

        // If set we remove the option to filter/sort the table.
        no_transformations: PropTypes.bool,

        // A list of column names to prevent transforms on
        prevent_transformations: PropTypes.object,

        // An optional toolbar that can be passed to the table.
        toolbar: PropTypes.object,

        // If set we do not render any toolbar
        no_toolbar: PropTypes.bool,

        // If specified we notify that a transform is set.
        transform: PropTypes.object,
        setTransform: PropTypes.func,

        // A descriptor object for the selector.
        // https://react-bootstrap-table.github.io/react-bootstrap-table2/docs/row-select-props.html
        selectRow: PropTypes.object,

        initial_page_size: PropTypes.number,

        // Additional columns to add (should be formatted with a
        // custom renderer).
        extra_columns: PropTypes.array,
        columns:  PropTypes.object,

        // A callback that will be called for each row fetched.
        row_filter: PropTypes.func,

        // Control the class of each row
        row_classes: PropTypes.func,

        // If set we disable the spinner.
        no_spinner: PropTypes.bool,

        // If set we report table columns here for completion.
        completion_reporter: PropTypes.func,

        // If set we update the callback with the pagination state.
        setPageStat: PropTypes.func,
    }

    state = {
        rows: [],
        columns: [],

        download: false,
        toggles: {},
        start_row: 0,
        page_size: 10,

        // If the table has an index this will be the total number of
        // rows in the table. If it is -1 then we dont know the total
        // number.
        total_size: 0,
        loading: true,

        // A transform applied on the basic table.
        transform: {},

        last_data: [],

        stack_path: [],

        showStackDialog: false,

        // Keep state for individual stacking transforms
        stack_transforms: {},
    }

    componentDidMount = () => {
        this.source = CancelToken.source();
        this.setState({page_size: this.props.initial_page_size || 10});

        this.fetchRows();
    }

    componentWillUnmount() {
        this.source.cancel();
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        // If the table has changed we need to clear the state
        // completely as it is a new table.
        if (!_.isUndefined(this.props.name) &&
            !_.isEqual(this.props.name, prevProps.name)) {
            this.setState({toggles: {}, rows: [], columns: []});
        }

        if (this.props.transform &&
            !_.isEqual(prevProps.transform, this.props.transform)) {
            this.setState({transform: this.props.transform});
        }

        if (!_.isEqual(prevProps.version, this.props.version)) {
            this.fetchRows();
            return;
        }

        if (!_.isEqual(prevProps.params, this.props.params) ||
            prevState.start_row !== this.state.start_row ||
            prevState.page_size !== this.state.page_size ||
            !_.isEqual(prevState.transform, this.state.transform)) {
            this.fetchRows();
        }
    }

    defaultFormatter = (cell, row, rowIndex) => {
        return <VeloValueRenderer value={cell}/>;
    }

    getColumnRenderer = column => {
        if(this.props.renderers && this.props.renderers[column]) {
            return this.props.renderers[column];
        }

        let column_types = this.state.column_types;
        if (!_.isArray(column_types)) {
            return this.defaultFormatter;
        }

        for (let i=0; i<column_types.length; i++) {
            if (column === column_types[i].name) {
                let type = column_types[i].type;
                switch (type) {
                case "base64":
                    return (cell, row, rowIndex)=>{
                        let decoded = cell.slice(0,1000);
                        try {
                            decoded = atob(cell);
                        } catch(e) {}

                        return <HexView data={decoded} height="2"/>;
                    };
                case "timestamp":
                    return (cell, row, rowIndex)=>{
                        return <VeloTimestamp usec={cell * 1000} iso={cell}/>;
                    };
                case "client_id":
                    return (cell, row, rowIndex)=>{
                        return <ClientLink client_id={cell}/>;
                    };

                default:
                    return this.defaultFormatter;
                }
            }
        }
        return this.defaultFormatter;
    }

    // Render the transformed view at the top right of the
    // table. Shows the user what transforms are currnetly active.
    getTransformed = ()=>{
        let result = [];
        let transform = Object.assign({}, this.state.transform || {});
        if(_.isEmpty(transform) && !_.isEmpty(this.props.transform)) {
            Object.assign(transform, this.props.transform);
        }

        if (transform.filter_column) {
            result.push(
                <ToolTip tooltip={T("Transformed")}>
                  <Button key="1"
                          disabled={true}
                          className="table-transformed"
                          variant="outline-dark">
                    { transform.filter_column } ( {transform.filter_regex} )
                    <span className="transform-button">
                      <FontAwesomeIcon icon="filter"/>
                    </span>
                  </Button>
                </ToolTip>
            );
        }

        if (transform.sort_column) {
            result.push(
                <ToolTip tooltip={T("Transformed")}>
                  <Button key="2"
                          disabled={true}
                          variant="outline-dark">
                    {transform.sort_column}
                    <span className="transform-button">
                      {
                          transform.sort_direction === "Ascending" ?
                              <FontAwesomeIcon icon="sort-alpha-up"/> :
                              <FontAwesomeIcon icon="sort-alpha-down"/>
                      }
                    </span>
                  </Button>
                </ToolTip>
            );
        }

        return result;
    }

    fetchRows = () => {
        if (_.isEmpty(this.props.params)) {
            this.setState({loading: false});
            return;
        }

        let params = Object.assign({}, this.props.params);
        let transform = Object.assign({}, this.state.transform || {});
        if(_.isEmpty(transform) && !_.isEmpty(this.props.transform)) {
            Object.assign(transform, this.props.transform);
        }

        Object.assign(params, transform);
        params.start_row = this.state.start_row || 0;
        if (params.start_row < 0) {
            params.start_row = 0;
        }
        params.rows = this.state.page_size;
        params.sort_direction = params.sort_direction === "Ascending";

        let url = this.props.url || "v1/GetTable";

        this.source.cancel();
        this.source = CancelToken.source();

        this.setState({loading: true});

        api.get(url, params, this.source.token).then((response) => {
            if (response.cancel) {
                return;
            }

            let stack_path = response.data && response.data.stack_path;
            let pageData = PrepareData(response.data);
            let toggles = Object.assign({}, this.state.toggles);
            let columns = pageData.columns;
            if (this.props.extra_columns) {
                columns = columns.concat(this.props.extra_columns);
            };

            if(this.props.completion_reporter) {
                this.props.completion_reporter(columns);
            }

            if (_.isEmpty(this.state.toggles) && !_.isUndefined(columns)) {
                let hidden = 0;

                // Hide columns that start with _
                _.each(columns, c=>{
                    if (c[0] === '_') {
                        toggles[c] = true;
                        hidden++;
                    } else {
                        toggles[c] = false;
                    }
                });

                // If all the columns are hidden, then just show them
                // all beause we need to show something.
                if (hidden === columns.length) {
                    toggles = {};
                }
            }
            if (this.props.row_filter) {
                pageData.rows = _.map(pageData.rows, this.props.row_filter);
            }

            this.setState({loading: false,
                           total_size: parseInt(response.data.total_rows || 0),
                           rows: pageData.rows,
                           all_columns: pageData.columns,
                           toggles: toggles,
                           stack_path: stack_path || [],
                           column_types: response.data.column_types,
                           columns: columns });

            if(this.props.setPageState) {
                this.props.setPageState({
                    total_size: parseInt(response.data.total_rows || 0),
                    start_row: this.state.start_row,
                    page_size: this.state.page_size,
                    onPageChange: page=>this.setState({
                        start_row: page * this.state.page_size}),
                    onPageSizeChange: size=>this.setState({page_size: size}),
                });
            }

        }).catch(() => {
            this.setState({loading: false, rows: [], columns: [], stack_path: []});
        });
    }

    // Update the transform specification between all the columns
    setTransform = transform=>{
        let new_transform = Object.assign({}, this.state.transform);
        new_transform = Object.assign(new_transform, transform);
        if(!_.isEqual(new_transform, this.state.transform)) {
            // When the transform changes filters we need to reset to
            // the first page because otherwise we might be past the
            // end of the table.
            if (new_transform.filter_column !== this.state.transform.filter_column ||
                new_transform.filter_regex !== this.state.transform.filter_regex) {
                this.setState({start_row: 0});
            }
            if(this.props.setTransform) {
                this.props.setTransform(transform);
            }
            this.setState({transform: new_transform});
        }
    }

    isColumnStacked = name=>{
        if (_.isEmpty(this.state.stack_path) ||
            this.state.stack_path.length < 3) {
            return false ;
        }
        return this.state.stack_path[this.state.stack_path.length-3] === name;
    }

    activeColumns = ()=>{
        let res = [];
        _.each(this.state.columns, c=>{
            if(!this.state.toggles[c]) {
                res.push(c);
            }
        });
        return res;
    }

    renderToolbar = ()=>{
        if(this.props.no_toolbar) {
            return <></>;
        };

        let timezone = (this.context.traits &&
                        this.context.traits.timezone) || "UTC";

        let transformed = this.getTransformed();
        let active_columns = this.activeColumns();
        let downloads = Object.assign({}, this.props.params);

        if (!_.isEqual(this.state.all_columns, active_columns)) {
            downloads.columns = active_columns;
        }

        return (
            <Navbar className="toolbar">
              <ButtonGroup>
                <ColumnToggle onToggle={(c)=>{
                    // Do not make a copy here because set state is
                    // not immediately visible and this will be called
                    // for each column.
                    let toggles = this.state.toggles;
                    toggles[c] = !toggles[c];
                    this.setState({toggles: toggles});
                }}
                              columns={this.state.columns}
                              toggles={this.state.toggles} />
                <InspectRawJson rows={this.state.rows} />
                <ToolTip tooltip={T("Download JSON")}>
                  <Button variant="default"
                          target="_blank" rel="noopener noreferrer"
                          href={api.href("/api/v1/DownloadTable",
                                         Object.assign(downloads, {
                                             timezone: timezone,
                                             download_format: "json",
                                         }), {internal: true})}>
                    <FontAwesomeIcon icon="download"/>
                    <span className="sr-only">{T("Download JSON")}</span>
                  </Button>
                </ToolTip>
                <ToolTip tooltip={T("Download CSV")}>
                  <Button variant="default"
                          target="_blank" rel="noopener noreferrer"
                          href={api.href("/api/v1/DownloadTable",
                                         Object.assign(downloads, {
                                             timezone: timezone,
                                             download_format: "csv",
                                         }), {internal: true})}>
                    <FontAwesomeIcon icon="file-csv"/>
                    <span className="sr-only">{T("Download CSV")}</span>
                  </Button>
                </ToolTip>

                { this.renderPaginator() }

              </ButtonGroup>
              { transformed.length > 0 &&
                <ButtonGroup className="float-right">
                  { transformed }
                </ButtonGroup>
              }
              { this.props.toolbar || <></> }
            </Navbar>
        );
    }

    renderHeader = (column, idx)=>{
        let column_name = column;
        if (this.props.translate_column_headers) {
            column_name = T(column_name);
        }

        // Do not allow this column to be sorted/filtered
        if (this.props.prevent_transformations &&
            this.props.prevent_transformations[column]) {
            return <th key={idx}>
                     <table className="paged-table-header">
                       <tbody>
                         <tr>
                           <td>{ column_name }</td>
                         </tr>
                       </tbody>
                     </table>
                   </th>;
        }

        return (
            <th key={idx}>
              <table className="paged-table-header">
                <tbody>
                  <tr>
                    <td>{ column_name }</td>
                    <td className="sort-element">
                      <ButtonGroup>
                        { this.isColumnStacked(column) &&
                          <ToolTip tooltip={T("Stack")}  key={idx}>
                            <Button variant="default"
                                    target="_blank" rel="noopener noreferrer"
                                    onClick={e=>{
                                        this.setState({showStackDialog: column});
                                        e.preventDefault();
                                        return false;
                                    }}>
                              <FontAwesomeIcon icon="layer-group"/>
                            </Button>
                          </ToolTip>
                        }
                        <ColumnSort column={column}
                                    transform={this.state.transform}
                                    setTransform={this.setTransform}
                        />

                        <ColumnFilter column={column}
                                      transform={this.state.transform}
                                      setTransform={this.setTransform}
                        />
                      </ButtonGroup>
                    </td>
                  </tr>
                </tbody>
              </table>
            </th>
        );
    }

    renderCell = (column, row, rowIdx) => {
        let t = this.state.toggles[column];
        if(t) {return undefined;};

        let cell = row[column];
        let renderer = this.getColumnRenderer(column);

        return <td key={column}>
                 { renderer(cell, row, rowIdx)}
               </td>;
    };

    selectRow = (row, idx)=>{
        if (!this.props.selectRow) {
            return;
        }

        if(this.props.selectRow.onSelect) {
            this.props.selectRow.onSelect(row);
        }

        this.setState({selected_row: row, selected_row_idx: idx});
    }

    renderRow = (row, idx)=>{
        let selected_cls = this.props.selectRow && this.props.selectRow.classes;
        if(this.state.selected_row_idx !== idx) {
            selected_cls = "";
        }

        return (
            <tr key={idx}
                onClick={x=>this.selectRow(row, idx)}
                className={selected_cls}>
              {_.map(this.activeColumns(), c=>this.renderCell(c, row, idx))}
            </tr>);
    }

    renderPaginator = (direction)=>{
        let end = this.state.start_row + this.state.page_size;
        if(end>this.state.total_size) {
            end=this.state.total_size;
        }

        return (
            <>
              <TablePaginationControl
                total_size={this.state.total_size}
                start_row={this.state.start_row}
                page_size={this.state.page_size}
                current_page={this.state.start_row / this.state.page_size}
                onPageChange={page=>this.setState({
                    start_row: page * this.state.page_size})}
                onPageSizeChange={size=>this.setState({page_size: size})}
                direction={direction}
              />
            </>    );
    }

    render = ()=>{
        return (
            <>{ this.renderToolbar() }
              <Table className="paged-table">
                <thead>
                  <tr className="paged-table-header">
                    {_.map(this.activeColumns(), this.renderHeader)}
                  </tr>
                </thead>
                <tbody className="fixed-table-body">
                  {_.map(this.state.rows, this.renderRow)}
                </tbody>
              </Table>
            </>);
    }
}

export default VeloPagedTable;
